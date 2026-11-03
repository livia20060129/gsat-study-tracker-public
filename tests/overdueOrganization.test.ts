import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizedOverdueSort, organizedOverdueEntries, skipOverdueRecordBatch } from '../src/study/overdueOrganization.ts';
import { overdueHandledTasks, overdueTasks, undoOverdueTaskAction } from '../src/study/overdueTasks.ts';
import type { StudyRecord } from '../src/types.ts';

function record(date: string): StudyRecord {
  return { date, notes: '保留筆記', items: ['a', 'b', 'c'].map(id => ({
    id, type: 'scienceReview', title: id, source: 'preset', required: true, done: id === 'c', minutes: '25',
    f: { subject: '物理', material: '新關鍵', start: '1', end: '5', progress: true, graded: false, corrected: false },
  })) };
}

test('long-term grouping begins at 31 days, never at 30, and does not change entries or records', () => {
  const source = [record('2026-10-04'), record('2026-10-03'), record('2026-11-02')];
  const before = structuredClone(source);
  const entries = overdueTasks(source, '2026-11-03');
  const organized = organizedOverdueEntries(entries, 'oldest');
  assert.deepEqual(organized.recent.map(entry => entry.daysOverdue), [30, 30, 1, 1]);
  assert.deepEqual(organized.longTerm.map(entry => entry.daysOverdue), [31, 31]);
  assert.deepEqual(source, before);
  assert.equal(organized.recent[0], entries.find(entry => entry.key === organized.recent[0].key));
});

test('sorting reverses dates within both sections and remains deterministic within a date', () => {
  const entries = overdueTasks([record('2026-09-01'), record('2026-09-02'), record('2026-11-01'), record('2026-11-02')], '2026-11-03');
  const forward = organizedOverdueEntries(entries, 'oldest');
  const reverse = organizedOverdueEntries(entries, 'newest');
  assert.deepEqual(forward.recent.map(entry => entry.recordDate), ['2026-11-01', '2026-11-01', '2026-11-02', '2026-11-02']);
  assert.deepEqual(reverse.recent.map(entry => entry.recordDate), ['2026-11-02', '2026-11-02', '2026-11-01', '2026-11-01']);
  assert.equal(reverse.longTerm[0].recordDate, '2026-09-02');
  assert.deepEqual(reverse.recent.slice(0, 2).map(entry => entry.itemId), ['a', 'b']);
  assert.equal(normalizedOverdueSort('newest'), 'newest');
  for (const invalid of [undefined, null, '', 'bad', {}]) assert.equal(normalizedOverdueSort(invalid), 'oldest');
});

test('batch skip only targets selected eligible IDs and preserves completion, pages, progress and minutes', () => {
  const source = record('2026-10-15'), before = structuredClone(source);
  const result = skipOverdueRecordBatch(source, ['a', 'a', 'c', 'missing'], '2026-11-03', '2026-11-03T04:00:00Z');
  assert.equal(result.skipped, 1);
  assert.ok(result.record);
  assert.equal(result.record.items[0].done, false);
  assert.equal(result.record.items[0].minutes, '25');
  assert.equal(result.record.items[0].f.start, '1');
  assert.equal(result.record.items[0].f.progress, true);
  assert.deepEqual(result.record.items.slice(1), before.items.slice(1));
  assert.deepEqual(source, before);
  assert.equal(overdueHandledTasks([result.record], Date.parse('2026-11-03T04:01:00Z'))[0].kind, 'skip');
  assert.equal(undoOverdueTaskAction(result.record, 'a', '2026-11-03')?.items[0].done, false);
});

test('batch skip rechecks latest eligibility and ignores today, future, completed or already skipped tasks', () => {
  const today = '2026-11-03', at = '2026-11-03T04:00:00Z';
  for (const date of [today, '2026-11-04']) assert.deepEqual(skipOverdueRecordBatch(record(date), ['a', 'c'], today, at), { record: null, skipped: 0 });
  const first = skipOverdueRecordBatch(record('2026-11-01'), ['a'], today, at).record!;
  assert.deepEqual(skipOverdueRecordBatch(first, ['a', 'c'], today, at), { record: null, skipped: 0 });
});
