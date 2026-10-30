import assert from 'node:assert/strict';
import test from 'node:test';
import { completedItemsForPeriod } from '../src/study/completedItems.ts';
import { completedStudyTimeEntries } from '../src/study/completedStudyTime.ts';
import { overdueHandledTasks, overdueTasks } from '../src/study/overdueTasks.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, overrides: Partial<StudyItem> = {}): StudyItem {
  return { id, type: 'general', title: id, source: 'preset', required: true, done: false, minutes: '25', f: {}, ...overrides };
}

test('all interactive types and legacy identities are excluded from todo without changing stored data', () => {
  const interactiveTypes = ['interactive', 'interactiveDaily', 'mathOral', 'englishPractice', 'biologyInteractive', 'englishVocabInteractive'];
  const interactiveKeys = ['daily_interactive', 'weekday_math_oral', 'fri_math_oral', 'sat_math_oral', 'sun_math_oral',
    'weekday_english_practice', 'fri_other', 'sat_english_practice', 'sun_english_practice', 'cal_interactive_event'];
  const record: StudyRecord = { date: '2026-10-24', items: [
    ...interactiveTypes.map(type => item(type, { type })),
    ...interactiveKeys.flatMap(key => [item(key, { presetKey: key }), item(`${key}-template`, { templatePresetKey: key })]),
    item('legacy-title', { title: '數 A 互動題：觀念題' }),
    item('calendar-template', { f: { calendarFixedTemplate: 'interactiveDaily' } }),
    item('legacy-selector', { f: { interactiveType: 'biologyInteractive' } }),
    item('legacy-container', { f: { interactiveEntries: [] } }),
    item('locked-vocabulary', { mondayFixedVocab: true }),
    item('reading', { type: 'extra', title: '英文教材閱讀', f: { title: 'ACE Reading', round: '3' } }),
  ] };
  const before = structuredClone(record);
  assert.deepEqual(overdueTasks([record], '2026-10-25').map(entry => entry.itemId), ['reading']);
  assert.deepEqual(record, before);
});

test('mixed merged cards retain non-interactive source tasks and exclude only interactive sources', () => {
  const records: StudyRecord[] = [{ date: '2026-10-24', items: [
    item('sources-parent', { source: 'summary', required: false, f: { dailyWorkSourceItems: [
      item('math-interactive', { type: 'mathOral' }),
      item('math-lecture', { type: 'mathLecture', f: { material: '教學講義' } }),
    ] } }),
    item('children-parent', { source: 'summary', required: false, f: { groupedWorkEntries: [
      item('english-interactive', { type: 'englishPractice' }),
      item('science', { type: 'scienceReview', f: { subject: '物理' } }),
    ] } }),
  ] }];
  const before = structuredClone(records);
  assert.deepEqual(overdueTasks(records, '2026-10-25').map(entry => entry.itemId).sort(), ['math-lecture', 'science']);
  assert.deepEqual(records, before);
});

test('old interactive handled entries and their nested children are hidden without deleting action metadata', () => {
  const handledAt = '2026-10-25T04:00:00Z';
  const action = { overdueTodoAction: { kind: 'complete' as const, handledAt } };
  const record: StudyRecord = { date: '2026-10-24', items: [
    item('interactive-done', { type: 'englishPractice', done: true, f: action }),
    item('interactive-skipped', { type: 'mathOral', f: { overdueTodoAction: { kind: 'skip', handledAt }, overdueSkippedOn: '2026-10-25' } }),
    item('interactive-parent', { type: 'interactiveDaily', done: true, f: { ...action, interactiveEntries: [
      item('old-child', { done: true, f: action }),
    ] } }),
    item('regular-done', { type: 'scienceReview', done: true, f: action }),
  ] };
  const before = structuredClone(record);
  assert.deepEqual(overdueHandledTasks([record], Date.parse(handledAt)).map(entry => entry.itemId), ['regular-done']);
  assert.deepEqual(record, before);
});

test('interactive todo exclusion leaves completed lists and learning-time calculations unchanged', () => {
  const record: StudyRecord = { date: '2026-10-24', items: [
    item('interactive-complete', { type: 'englishPractice', title: '英文互動題紀錄', done: true, checkedOn: '2026-10-24' }),
    item('interactive-pending', { type: 'biologyInteractive', minutes: '10' }),
  ] };
  const before = structuredClone(record);
  const period = { start: record.date, end: record.date };
  const completed = completedItemsForPeriod([record], period);
  const time = completedStudyTimeEntries([record]);
  assert.ok(completed.some(entry => entry.title === '英文互動題紀錄'));
  assert.ok(time.length > 0);
  assert.deepEqual(overdueTasks([record], '2026-10-25'), []);
  overdueHandledTasks([record], Date.parse('2026-10-25T04:00:00Z'));
  assert.deepEqual(completedItemsForPeriod([record], period), completed);
  assert.deepEqual(completedStudyTimeEntries([record]), time);
  assert.deepEqual(record, before);
});
