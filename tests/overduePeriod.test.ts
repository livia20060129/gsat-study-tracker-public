import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizedOverduePeriod, OVERDUE_PERIODS, overdueEntriesForPeriod, overduePeriodIndex, overduePeriodRange } from '../src/study/overduePeriod.ts';
import { overdueHandledTasks, overdueTasks } from '../src/study/overdueTasks.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

test('todo period options default to all and keep the requested slider order', () => {
  assert.deepEqual(OVERDUE_PERIODS, ['all', 'month', 'week']);
  for (const [index, period] of OVERDUE_PERIODS.entries()) {
    assert.equal(normalizedOverduePeriod(period), period);
    assert.equal(overduePeriodIndex(period), index);
  }
  for (const value of [null, undefined, '', 'monthly', '__proto__', 1]) assert.equal(normalizedOverduePeriod(value), 'all');
});

test('todo uses calendar months and Monday-to-Sunday weeks including cross-month, cross-year and leap-year boundaries', () => {
  assert.equal(overduePeriodRange('all', '2026-10-25'), null);
  assert.deepEqual(overduePeriodRange('month', '2026-10-25'), { start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(overduePeriodRange('month', '2028-02-29'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(overduePeriodRange('month', '2026-02-15'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(overduePeriodRange('week', '2026-10-25'), { start: '2026-10-19', end: '2026-10-25' });
  assert.deepEqual(overduePeriodRange('week', '2026-10-26'), { start: '2026-10-26', end: '2026-11-01' });
  assert.deepEqual(overduePeriodRange('week', '2026-11-01'), { start: '2026-10-26', end: '2026-11-01' });
  assert.deepEqual(overduePeriodRange('week', '2026-01-03'), { start: '2025-12-29', end: '2026-01-04' });
});

test('period filtering uses original scheduled dates, preserves ordering and never changes the entries', () => {
  const entries = [
    { recordDate: '2026-10-24', itemId: 'week', completionDate: '2026-09-30' },
    { recordDate: '2026-09-30', itemId: 'old', completionDate: '2026-10-24' },
    { recordDate: '2026-10-01', itemId: 'month', completionDate: '' },
    { recordDate: '2026-10-19', itemId: 'monday', completionDate: '' },
    { recordDate: '2026-10-18', itemId: 'previous-week', completionDate: '' },
  ];
  const before = structuredClone(entries);
  assert.deepEqual(overdueEntriesForPeriod(entries, 'all', '2026-10-25'), entries);
  assert.deepEqual(overdueEntriesForPeriod(entries, 'month', '2026-10-25').map(entry => entry.itemId), ['week', 'month', 'monday', 'previous-week']);
  const week = overdueEntriesForPeriod(entries, 'week', '2026-10-25');
  assert.deepEqual(week.map(entry => entry.itemId), ['week', 'monday']);
  assert.equal(week[0], entries[0]);
  assert.deepEqual(entries, before);
});

function record(date: string, id: string, overrides: Partial<StudyItem> = {}): StudyRecord {
  return { date, items: [{ id, type: 'scienceReview', title: id, source: 'preset', required: true, done: false,
    minutes: '25', f: { subject: '物理' }, ...overrides }] };
}

test('period filtering retains overdue eligibility and subject filters without reviving excluded tasks', () => {
  const records = [record('2026-09-30', 'old'), record('2026-10-01', 'month'), record('2026-10-19', 'monday'),
    record('2026-10-24', 'english', { type: 'extra', f: { title: 'ACE Reading', round: '3' } }),
    record('2026-10-25', 'today'), record('2026-10-26', 'future'), record('2026-10-24', 'done', { done: true }),
    record('2026-10-24', 'interactive', { type: 'interactiveDaily' }),
    record('2026-10-24', 'timed', { presetKey: 'fri_mock_timed' }),
    record('2026-10-24', 'magazine', { presetKey: 'weekday_magazine' })];
  const before = structuredClone(records);
  const entries = overdueTasks(records, '2026-10-25');
  assert.equal(entries.length, 4);
  assert.equal(overdueEntriesForPeriod(entries, 'month', '2026-10-25').length, 3);
  const week = overdueEntriesForPeriod(entries, 'week', '2026-10-25');
  assert.deepEqual(week.map(entry => entry.itemId), ['monday', 'english']);
  assert.deepEqual(week.filter(entry => entry.subject === 'english').map(entry => entry.itemId), ['english']);
  assert.deepEqual(records, before);
});

test('the first day of a month or week can have no overdue tasks, while a cross-month week still includes earlier month days', () => {
  const entries = overdueTasks([record('2026-05-31', 'yesterday'), record('2026-06-01', 'today')], '2026-06-01');
  assert.equal(overdueEntriesForPeriod(entries, 'all', '2026-06-01').length, 1);
  assert.deepEqual(overdueEntriesForPeriod(entries, 'month', '2026-06-01'), []);
  assert.deepEqual(overdueEntriesForPeriod(entries, 'week', '2026-06-01'), []);
  const crossMonth = overdueTasks([record('2026-10-31', 'yesterday')], '2026-11-01');
  assert.equal(overdueEntriesForPeriod(crossMonth, 'week', '2026-11-01').length, 1);
  assert.deepEqual(overdueEntriesForPeriod(crossMonth, 'month', '2026-11-01'), []);
});

test('period filtering does not change the independent 72-hour handled list or its original record', () => {
  const handledAt = '2026-10-25T04:00:00Z';
  const original = record('2026-09-30', 'handled', { done: true,
    f: { subject: '物理', overdueTodoAction: { kind: 'complete', handledAt } } });
  const before = structuredClone(original);
  const handled = overdueHandledTasks([original], Date.parse(handledAt));
  for (const period of OVERDUE_PERIODS) overdueEntriesForPeriod(overdueTasks([original], '2026-10-25'), period, '2026-10-25');
  assert.equal(handled.length, 1);
  assert.deepEqual(overdueHandledTasks([original], Date.parse(handledAt)), handled);
  assert.deepEqual(original, before);
});
