import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeQueuedRecord, reconcileLocalRecordEdit, saveLocalRecordEdit } from '../src/application/records/localRecordEdits.ts';
import { updateOverdueTaskMinutes } from '../src/study/overdueTasks.ts';
import type { StudyRecord } from '../src/types.ts';

function fixture(): StudyRecord {
  return { date: '2026-10-15', notes: '', items: [{ id: 'task', type: 'englishPractice',
    required: true, source: 'preset', done: false, minutes: '', f: {} }] };
}

function storageFixture(initial: StudyRecord) {
  const values = new Map<string, string>([['study-v11:guest:2026-10-15', JSON.stringify(initial)]]);
  return {
    values, get length() { return values.size; }, key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
}

test('a stale untouched Calendar projection cannot revive a cleared schedule conflict', () => {
  const base = fixture();
  base.items[0].f = { calendarEventKey: 'primary:task', calendarPlanTitle: 'old' };
  const draft = structuredClone(base);
  draft.items[0].f.calendarPlanTitle = 'rendered';
  draft.syncConflict = true;
  draft.syncConflictLocal = structuredClone(base);
  draft.syncConflictCloud = structuredClone(base);
  const latest = structuredClone(base);
  latest.items[0].f.calendarPlanTitle = 'latest Actions';
  latest.syncConflict = false;
  latest.localDirty = false;
  const result = reconcileLocalRecordEdit(draft, latest, base);
  assert.equal(result.record, latest);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.record.syncConflict, false);
  assert.equal(result.record.localDirty, false);
});

function preCalendarRender(): { base: StudyRecord; draft: StudyRecord; latest: StudyRecord } {
  const base = fixture();
  base.items.push({ id: 'magazine', type: 'magazine', source: 'preset', required: true, done: false, minutes: '', f: {} });
  const draft = structuredClone(base);
  draft.items[0].f.timeTracking = { mode: 'manual', accumulatedSeconds: 0, startedAt: null };
  draft.items[1].f.entries = [{ id: 'generated-row', name: '', month: '10', unit: '', minutes: '',
    magazineMonthInitialized: true, timeTracking: { mode: 'manual', accumulatedSeconds: 0, startedAt: null } }];
  const latest: StudyRecord = { date: base.date, notes: '', localDirty: false, syncConflict: false,
    items: [{ id: 'calendar', type: 'extra', source: 'preset', required: true, done: false, minutes: '',
      f: { calendarEventKey: 'primary:task', book: 'ACE Reading', round: '6' } }] };
  return { base, draft, latest };
}

test('a queued blank render uses the latest Calendar cache before and after a delayed cloud read', () => {
  const { base, draft, latest } = preCalendarRender();
  draft.syncBase = structuredClone(base);
  const queued = structuredClone(draft);
  assert.equal(mergeQueuedRecord(queued, latest), latest);
  assert.equal(mergeQueuedRecord(mergeQueuedRecord(queued, draft), latest), latest);
  assert.equal(latest.syncConflict, false);
  assert.equal(latest.localDirty, false);
});

test('queued Calendar cache preference preserves actual input and same-field conflicts', () => {
  for (const owner of ['queued', 'latest'] as const) {
    const { base, draft: queued, latest } = preCalendarRender();
    queued.syncBase = structuredClone(base);
    ({ queued, latest })[owner].notes = 'actual input';
    assert.equal(mergeQueuedRecord(queued, latest).notes, 'actual input', owner);
  }
  const { base, draft: queued, latest } = preCalendarRender();
  queued.syncBase = structuredClone(base);
  queued.notes = 'queued input'; latest.notes = 'new input';
  assert.ok(mergeQueuedRecord(queued, latest).syncConflictDetails?.some(conflict => conflict.path === '$.notes'));
});

test('a render started before Calendar loading uses the latest untouched schedule without delete-vs-edit conflicts', () => {
  const { base, draft, latest } = preCalendarRender();
  const result = reconcileLocalRecordEdit(draft, latest, base);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.record, latest);
  assert.equal(result.record.syncConflict, false);
  assert.equal(result.record.localDirty, false);
});

test('pre-Calendar rendering still protects input, recoverable versions and unreadable records', () => {
  for (const version of ['base', 'draft', 'latest'] as const) {
    for (const protect of ['notes', 'syncBase', 'syncConflictLocal', 'syncConflictCloud', 'minutes', 'words', 'storage'] as const) {
      const versions = preCalendarRender(), record = versions[version];
      if (protect === 'notes') record.notes = 'real input';
      if (protect === 'syncBase' || protect === 'syncConflictLocal' || protect === 'syncConflictCloud') {
        record[protect] = { ...structuredClone(record), notes: 'earlier input' };
      }
      if (protect === 'minutes') record.items[0].minutes = '5';
      if (protect === 'words') record.items[0].f.words = [{ text: 'intriguing', translation: '有趣的' }];
      if (protect === 'storage') record.storageIssue = { source: 'local', date: record.date,
        error: 'unreadable', backupKey: 'recovery', capturedAt: '2026-11-09T12:00:00Z' };
      const result = reconcileLocalRecordEdit(versions.draft, versions.latest, versions.base);
      assert.equal(result.usedThreeWayMerge, true, `${version}: ${protect}`);
      assert.notEqual(result.record, versions.latest, `${version}: ${protect}`);
    }
  }
});

test('Calendar cache preference never discards actual input or a deliberately cleared prior input', () => {
  for (const protectedVersion of ['draft', 'latest', 'base'] as const) {
    const base = fixture();
    base.items[0].f = { calendarEventKey: 'primary:task', calendarPlanTitle: 'old' };
    const draft = structuredClone(base), latest = structuredClone(base);
    draft.items[0].f.calendarPlanTitle = 'rendered';
    latest.items[0].f.calendarPlanTitle = 'Actions';
    ({ draft, latest, base })[protectedVersion].notes = 'real input';
    const result = reconcileLocalRecordEdit(draft, latest, base);
    assert.equal(result.usedThreeWayMerge, true);
    assert.notEqual(result.record, latest);
  }
});

test('unrelated cache normalization still merges newly initialized natural-subject children', () => {
  const base = fixture();
  base.items[0].presetKey = 'cal_natural';
  const draft = structuredClone(base), latest = structuredClone(base);
  draft.items[0].f.calendarIntegrationEntries = [{ id: 'biology', type: 'scienceReview', subject: '生物', done: false, minutes: '', source: 'preset', f: { subject: '生物' } }];
  latest.mood = '';
  latest.notes = '';
  const result = reconcileLocalRecordEdit(draft, latest, base);
  assert.deepEqual(result.conflicts, []);
  assert.equal((result.record.items[0].f.calendarIntegrationEntries as { id: string }[])[0].id, 'biology');
});

test('standalone edits merge a newer unrelated field instead of overwriting another tab', () => {
  const base = fixture();
  const latest = fixture();
  latest.notes = '其他頁籤已儲存';
  latest.items[0].done = true;
  const storage = storageFixture(latest);
  const saved = saveLocalRecordEdit(storage, 'study-v11:guest:', base, record => updateOverdueTaskMinutes(record, 'task', '25'));
  assert.equal(saved?.notes, latest.notes);
  assert.equal(saved?.items[0].done, true);
  assert.equal(saved?.items[0].minutes, '25');
  assert.equal(saved?.localDirty, true);
});

test('same-field conflicts preserve the latest record and fail with an actionable message', () => {
  const base = fixture();
  const latest = fixture();
  latest.items[0].minutes = '15';
  const storage = storageFixture(latest);
  assert.throws(() => saveLocalRecordEdit(storage, 'study-v11:guest:', base,
    record => updateOverdueTaskMinutes(record, 'task', '25')), /同一欄位/);
  assert.equal(JSON.parse(storage.getItem('study-v11:guest:2026-10-15')!).items[0].minutes, '15');
});

test('unreadable or missing source records are not silently replaced', () => {
  const base = fixture();
  const storage = storageFixture(base);
  storage.setItem('study-v11:guest:2026-10-15', '{broken');
  assert.throws(() => saveLocalRecordEdit(storage, 'study-v11:guest:', base,
    record => updateOverdueTaskMinutes(record, 'task', '25')), /無法讀取/);
  assert.equal(storage.getItem('study-v11:guest:2026-10-15'), '{broken');
});

test('failed storage writes do not report success or mutate the loaded draft', () => {
  const base = fixture();
  const storage = storageFixture(base);
  storage.setItem = () => { throw new Error('quota'); };
  assert.throws(() => saveLocalRecordEdit(storage, 'study-v11:guest:', base,
    record => updateOverdueTaskMinutes(record, 'task', '25')), /無法儲存/);
  assert.equal(base.items[0].minutes, '');
});
