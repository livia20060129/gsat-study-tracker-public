import assert from 'node:assert/strict';
import test from 'node:test';
import { completedRangeIndex, markRangeCompletionByUser, reconcileRangeCompletion } from '../src/study/rangeCompletion.ts';
import { synchronizeRangeCompletion } from '../src/application/records/synchronizeRangeCompletion.ts';
import { LocalStudyRecordRepository } from '../src/infrastructure/storage/localStudyRecordRepository.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, start = '1', end = '10', done = false): StudyItem {
  return { id, type: 'mathLecture', required: true, source: 'preset', done, minutes: '',
    f: { material: '教學講義', book: '3A', start, end, graded: false, corrected: false } };
}
function record(date: string, ...items: StudyItem[]): StudyRecord { return { date, items }; }
function reconcile(target: StudyRecord, ...sources: StudyRecord[]): StudyRecord | null {
  return reconcileRangeCompletion(target, completedRangeIndex([...sources, target]));
}

test('public Calendar generic materials participate while civics, history, geography and natural sciences remain isolated', () => {
  function social(subject: string, done: boolean): StudyItem {
    return { id: subject, type: 'general', required: true, source: 'preset', done, minutes: '',
      f: { subject, book: '自訂複習講義', scopeKind: 'pages', start: '1', end: '10' } };
  }
  const source = record('2026-11-01', social('歷史', true));
  const target = record('2026-11-03', social('歷史', false), social('地理', false), social('公民', false));
  const resolved = reconcile(target, source)!;
  assert.equal(resolved.items[0].done, true);
  assert.equal(resolved.items[1].done, false);
  assert.equal(resolved.items[2].done, false);
});

test('completed adjacent ranges check a fully covered overdue/future item with the actual completion date', () => {
  const source1 = record('2026-11-01', item('one', '1', '5', true));
  source1.items[0].checkedOn = '2026-11-05';
  const source2 = record('2026-11-04', item('two', '6', '10', true));
  const target = record('2026-11-10', item('plan'));
  const result = reconcile(target, source1, source2)!;
  assert.equal(result.items[0].done, true);
  assert.equal(result.items[0].checkedOn, '2026-11-05');
  assert.equal(result.items[0].minutes, '');
  assert.equal(result.items[0].f.graded, false);
  assert.equal(result.items[0].f.corrected, false);
  assert.equal(target.items[0].done, false);
  assert.equal(reconcile(result, source1, source2), null);
});

test('partial, missing, reversed and non-completed ranges never check a plan', () => {
  const target = record('2026-11-10', item('plan'));
  for (const source of [item('partial', '1', '9', true), item('gap', '2', '10', true),
    item('bad', '10', '1', true), item('blank', '', '', true), item('unchecked')]) {
    assert.equal(reconcile(target, record('2026-11-04', source)), null);
  }
  assert.equal(reconcile(target, record('2026-11-04', item('a', '1', '4', true), item('b', '6', '10', true))), null);
});

test('a later larger overlap cannot move an existing completion date forward or cause another write', () => {
  const first = record('2026-11-01', item('first', '5', '10', true));
  const target = record('2026-11-10', item('plan', '5', '10'));
  const marked = reconcile(target, first)!;
  const later = record('2026-11-05', item('larger-reread', '1', '20', true));
  assert.equal(reconcile(marked, first, later), null);
  assert.equal(reconcile(target, first, later)?.items[0].checkedOn, '2026-11-01');
  assert.equal(reconcile(marked, later)?.items[0].checkedOn, '2026-11-05');
});

test('editions, volumes and practice stage stay independent', () => {
  const target = record('2026-11-10', item('plan'));
  for (const update of [{ f: { material: '新關鍵' } }, { f: { book: '3B' } }, { type: 'mathPractice' }]) {
    const source = item('source', '1', '10', true);
    Object.assign(source.f, update.f);
    if (update.type) source.type = update.type;
    assert.equal(reconcile(target, record('2026-11-04', source)), null);
  }
});

test('science subjects do not share page coverage', () => {
  const bio: StudyItem = { ...item('bio', '1', '10', true), type: 'scienceReview', f: { subject: '生物', material: '新關鍵', start: '1', end: '10' } };
  const chem: StudyItem = { ...bio, id: 'chem', done: false, f: { ...bio.f, subject: '化學' } };
  assert.equal(reconcile(record('2026-11-10', chem), record('2026-11-04', bio)), null);
  chem.f.subject = '生物';
  assert.equal(reconcile(record('2026-11-10', chem), record('2026-11-04', bio))?.items[0].done, true);
});

test('a conflicted source cannot complete another date before the conflict is resolved', () => {
  const source = record('2026-11-04', item('source', '1', '10', true));
  source.syncConflict = true;
  assert.equal(reconcile(record('2026-11-10', item('plan')), source), null);
  source.syncConflict = false;
  assert.equal(reconcile(record('2026-11-10', item('plan')), source)?.items[0].done, true);
});

test('Unit and round coverage supports intervals and never mixes with pages', () => {
  for (const kind of ['unit', 'round'] as const) {
    const f = kind === 'unit' ? { unitStart: '2', unitEnd: '4' } : { round: '2', roundEnd: '4' };
    const source: StudyItem = { ...item('source', '2', '4', true), type: 'extra', f: { title: '自訂教材', scopeKind: kind, ...f } };
    const target = { ...source, id: 'plan', done: false, f: { ...source.f } };
    assert.equal(reconcile(record('2026-11-10', target), record('2026-11-04', source))?.items[0].done, true);
    target.f = { title: '自訂教材', scopeKind: 'pages', start: '2', end: '4' };
    assert.equal(reconcile(record('2026-11-10', target), record('2026-11-04', source)), null);
  }
});

test('automatic marks retract when evidence is removed and cannot perpetuate themselves', () => {
  const source = record('2026-11-04', item('source', '1', '10', true));
  const target = record('2026-11-10', item('plan'));
  const marked = reconcile(target, source)!;
  const second = record('2026-11-11', item('next'));
  assert.equal(reconcile(second, marked), null);
  assert.equal(reconcile(marked)?.items[0].done, false);
  markRangeCompletionByUser(marked.items[0], true);
  assert.equal(reconcile(marked), null);
});

test('explicit unchecks, skipped items and completion dates are preserved', () => {
  const source = record('2026-11-04', item('source', '1', '10', true));
  const target = record('2026-11-10', item('plan'));
  markRangeCompletionByUser(target.items[0], false);
  assert.equal(reconcile(target, source), null);
  delete target.items[0].f.rangeCompletionOptOut;
  target.items[0].f.overdueSkippedOn = '2026-11-05';
  assert.equal(reconcile(target, source), null);
  delete target.items[0].f.overdueSkippedOn;
  target.items[0].done = true;
  target.items[0].checkedOn = '2026-10-31';
  assert.equal(reconcile(target, source), null);
});

test('grouped canonical source and visible copies are checked together without changing unrelated child', () => {
  const child = item('child');
  const root = item('group');
  root.f = { dailyWorkSourceItems: [child], groupedWorkEntries: [{ ...child, f: { ...child.f } }] };
  const target = record('2026-11-10', root, item('different', '20', '30'));
  const updated = reconcile(target, record('2026-11-04', item('source', '1', '10', true)))!;
  assert.equal(updated.items[0].done, true);
  assert.equal(updated.items[0].f.dailyWorkSourceItems![0].done, true);
  assert.equal(updated.items[0].f.groupedWorkEntries![0].done, true);
  assert.equal(updated.items[1].done, false);
});

test('local saves dirty only affected dates, stay account scoped, and metadata survives payload round-trip', () => {
  const data = new Map<string, string>();
  const storage = { get length() { return data.size; }, key(i: number) { return [...data.keys()][i] ?? null; },
    getItem(k: string) { return data.get(k) ?? null; }, setItem(k: string, v: string) { data.set(k, v); }, removeItem(k: string) { data.delete(k); } };
  const prefix = 'study-v11:guest:';
  const repository = new LocalStudyRecordRepository(storage, prefix);
  repository.save(record('2026-11-04', item('source', '1', '10', true)));
  repository.save(record('2026-11-10', item('plan')));
  const otherKey = 'study-v11:user:other:2026-11-10';
  data.set(otherKey, JSON.stringify(record('2026-11-10', item('other'))));
  const first = synchronizeRangeCompletion(storage, prefix);
  assert.deepEqual(first.saved.map(row => row.date), ['2026-11-10']);
  assert.equal(first.saved[0].localDirty, true);
  const payload = encodeStudyRecord(first.saved[0]);
  const decoded = decodeStudyRecord(payload, '2026-11-10');
  assert.equal(decoded.ok && decoded.record.items[0].done, true);
  assert.ok(decoded.ok && decoded.record.items[0].f.rangeCompletion);
  assert.equal(JSON.parse(data.get(otherKey)!).items[0].done, false);
  assert.deepEqual(synchronizeRangeCompletion(storage, prefix).saved, []);
});

test('secondary storage failure leaves the original target untouched and reports its date', () => {
  const rows = [record('2026-11-04', item('source', '1', '10', true)), record('2026-11-10', item('plan'))];
  const values = new Map(rows.map(row => [`test:${row.date}`, JSON.stringify(row)]));
  const storage = { get length() { return values.size; }, key(i: number) { return [...values.keys()][i] ?? null; },
    getItem(k: string) { return values.get(k) ?? null; }, setItem() { throw new Error('unavailable'); }, removeItem() {} };
  const result = synchronizeRangeCompletion(storage, 'test:');
  assert.deepEqual(result.failedDates, ['2026-11-10']);
  assert.equal(JSON.parse(values.get('test:2026-11-10')!).items[0].done, false);
});
