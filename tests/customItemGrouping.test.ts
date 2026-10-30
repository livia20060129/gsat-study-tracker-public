import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { groupDailyWorkItems, propagateDailyWorkDone, propagateDailyWorkField, ungroupDailyWorkItems } from '../src/study/dailyWorkGroup.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function custom(id: string, fields: StudyItem['f'] = {}, type = 'mathLecture'): StudyItem {
  return { id, type, title: '數學講義：進度', source: 'custom', required: false,
    done: false, minutes: '12', f: { material: '教學講義', book: '1', ...fields } };
}

for (const [label, ranges] of [
  ['adjacent', [[1, 5], [6, 10]]],
  ['overlapping', [[1, 8], [5, 10]]],
  ['identical', [[1, 5], [1, 5]]],
  ['separated', [[1, 5], [11, 15]]],
] as const) {
  test(`custom ${label} page ranges stay independent and unchanged`, () => {
    const items = ranges.map(([start, end], index) => custom(`custom-${index}`, { start: String(start), end: String(end) }));
    items[1].done = true; items[1].checkedOn = '2026-10-18'; items[1].minutes = '34';
    items[1].f.corrected = true; items[1].f.reason = '保留訂正';
    const snapshot = structuredClone(items);
    const result = groupDailyWorkItems(items);
    assert.deepEqual(result, snapshot);
    assert.equal(result[0], items[0]);
    assert.equal(result[1], items[1]);
  });
}

test('custom rounds, Units, blank fixed templates and legacy cards never merge', () => {
  for (const fields of [
    { round: '2' }, { scopeKind: 'round', round: '2', roundEnd: '3' },
    { scopeKind: 'unit', unitStart: '1', unitEnd: '2' }, {},
  ]) {
    const items = [custom('first', fields, 'extra'), custom('second', fields, 'extra')];
    assert.deepEqual(groupDailyWorkItems(items), items);
    items.forEach(item => { delete item.source; });
    assert.deepEqual(groupDailyWorkItems(items), items);
  }
});

test('required custom cards remain separate from each other and scheduled work', () => {
  const manual = [custom('manual-a', { start: '1', end: '5' }), custom('manual-b', { start: '6', end: '10' })];
  manual.forEach(item => { item.required = true; });
  const scheduled = manual.map((item, index) => ({ ...structuredClone(item), id: `scheduled-${index}`, source: 'preset' }));
  const output = groupDailyWorkItems([manual[0], scheduled[0], manual[1], scheduled[1]]);
  assert.equal(output.length, 3);
  assert.equal(output[0], manual[0]);
  assert.equal(output[2], manual[1]);
  assert.deepEqual(output[1].f.dailyWorkSourceItems?.map(item => item.id), ['scheduled-0', 'scheduled-1']);
  assert.deepEqual([output[1].f.start, output[1].f.end], ['1', '10']);
  propagateDailyWorkDone(output[1], true);
  assert.ok(manual.every(item => !item.done));
});

test('a custom fixed-template card is not absorbed by a blank or ranged scheduled template', () => {
  const manual = custom('manual', { start: '11', end: '15' }, 'mathPractice');
  manual.title = '數學講義題目：理解檢查＋錯題標記＋訂正';
  const scheduled = [
    { ...custom('blank', {}, 'mathPractice'), title: manual.title, source: 'preset', required: true },
    { ...custom('range', { start: '1', end: '5' }, 'mathPractice'), title: manual.title, source: 'preset' },
  ];
  const result = groupDailyWorkItems([scheduled[0], manual, scheduled[1]]);
  assert.equal(result.length, 2);
  assert.equal(result[1], manual);
  assert.deepEqual(result[0].f.dailyWorkSourceItems?.map(item => item.id), ['blank', 'range']);
  assert.deepEqual([result[0].f.start, result[0].f.end], ['1', '5']);
});

test('stored old aggregates restore custom source cards without losing their individual data', () => {
  const first = custom('first', { start: '1', end: '5', progress: true });
  const second = custom('second', { start: '6', end: '10', reason: '獨立筆記' });
  second.done = true; second.checkedOn = '2026-10-18'; second.minutes = '34';
  second.f.timeTracking = { mode: 'timer', accumulatedSeconds: 2040, startedAt: null };
  const old: StudyRecord = { date: '2026-10-18', items: [{ ...first, id: 'old-combined',
    f: { ...first.f, start: '1', end: '10', dailyWorkGroup: true, dailyWorkSourceItems: [first, second] } }] };
  const decoded = decodeStudyRecord(encodeStudyRecord(old), old.date);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) throw new Error(decoded.error);
  const restored = groupDailyWorkItems(ungroupDailyWorkItems(decoded.record.items));
  assert.deepEqual(restored, [first, second]);
  propagateDailyWorkDone(restored[0], true);
  propagateDailyWorkField(restored[0], 'reason', '第一張修改');
  assert.equal(restored[1].f.reason, '獨立筆記');
  assert.equal(restored[1].minutes, '34');
  assert.equal(restored[1].checkedOn, '2026-10-18');
  assert.deepEqual(restored[1].f.timeTracking, second.f.timeTracking);
});
