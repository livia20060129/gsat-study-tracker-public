import assert from 'node:assert/strict';
import test from 'node:test';
import { completedItemsForPeriod } from '../src/study/completedItems.ts';
import { completedStudyTimeEntries } from '../src/study/completedStudyTime.ts';
import { summarizeCompletionUnits } from '../src/study/completionMetrics.ts';
import { isInteractiveStudyItem } from '../src/study/interactiveTasks.ts';
import { summarizeLearningPeriod, summaryCompletionUnitsForRecord, summaryPeriod } from '../src/study/learningSummary.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, overrides: Partial<StudyItem> = {}): StudyItem {
  return { id, type: 'general', title: id, done: false, minutes: '', required: true, source: 'preset', f: {}, ...overrides };
}

test('interactive optional policy recognizes current types, legacy presets and Calendar identities', () => {
  for (const type of ['interactive', 'interactiveDaily', 'mathOral', 'englishPractice', 'biologyInteractive', 'englishVocabInteractive']) {
    assert.equal(isInteractiveStudyItem({ type }), true);
  }
  for (const presetKey of ['daily_interactive', 'weekday_math_oral', 'fri_math_oral', 'sat_math_oral', 'sun_math_oral',
    'weekday_english_practice', 'fri_other', 'sat_english_practice', 'sun_english_practice', 'cal_interactive_old']) {
    assert.equal(isInteractiveStudyItem({ presetKey }), true);
    assert.equal(isInteractiveStudyItem({ templatePresetKey: presetKey }), true);
  }
  for (const entry of [{ title: '英文互動題：英聽及學測練習' }, { mondayFixedVocab: true },
    { f: { calendarFixedTemplate: 'interactiveDaily' } }, { f: { interactiveEntries: [] } },
    { f: { interactiveType: 'biologyInteractive' } }]) assert.equal(isInteractiveStudyItem(entry), true);
  for (const entry of [null, undefined, {}, { type: 'scienceReview' }, { title: 'CNN互動英文', type: 'magazine' }]) {
    assert.equal(isInteractiveStudyItem(entry), false);
  }
});

test('old required interactive records contribute no completion units whether pending, done, custom or carried makeup', () => {
  const interactive = ['interactive', 'interactiveDaily', 'mathOral', 'englishPractice', 'biologyInteractive', 'englishVocabInteractive'];
  const record: StudyRecord = { date: '2026-10-26', items: [
    item('required-complete', { done: true }), item('required-pending'),
    ...interactive.flatMap(type => [false, true].map(done => item(`${type}-${done}`, {
      type, done, required: true, source: 'custom', deferredCarry: true,
    }))),
  ] };
  const before = structuredClone(record);
  const result = summarizeCompletionUnits(summaryCompletionUnitsForRecord(record));
  assert.equal(result.itemTotal, 2);
  assert.equal(result.workloadTotal, 2);
  assert.equal(result.itemPercent, 50);
  assert.equal(result.workloadPercent, 50);
  assert.deepEqual(record, before);
});

test('mixed groups and Saturday makeup exclude only interactive children and retain regular workload', () => {
  const record: StudyRecord = { date: '2026-10-24', items: [
    item('group', { f: { groupedWorkEntries: [
      item('lecture', { done: true }), item('optional-practice', { type: 'mathOral' }),
    ] } }),
    item('saturday', { presetKey: 'sat_makeup', f: { makeupEntries: [
      item('reading', { done: true }), item('optional-english', { type: 'englishPractice' }),
    ] } }),
  ] };
  const before = structuredClone(record);
  const result = summarizeCompletionUnits(summaryCompletionUnitsForRecord(record));
  assert.equal(result.itemTotal, 2);
  assert.equal(result.itemCompleted, 1);
  assert.equal(result.workloadTotal, 3);
  assert.equal(result.workloadCompleted, 2);
  assert.deepEqual(record, before);
});

test('optional practice keeps completed dates, study minutes and completion-list entries', () => {
  const record: StudyRecord = { date: '2026-10-25', items: [
    item('interactive', { type: 'interactiveDaily', f: { interactiveEntries: [
      item('completed-practice', { type: 'biologyInteractive', done: true, checkedOn: '2026-10-26', minutes: '25' }),
      item('unfinished-practice', { type: 'mathOral', minutes: '80' }),
    ] } }),
    item('completed-standalone', { type: 'englishPractice', done: true, checkedOn: '2026-10-26', minutes: '20' }),
  ] };
  const before = structuredClone(record);
  assert.equal(summaryCompletionUnitsForRecord(record).length, 0);
  assert.equal(completedStudyTimeEntries([record]).reduce((sum, entry) => sum + entry.minutes, 0), 45);
  const completed = completedItemsForPeriod([record], { start: '2026-10-26', end: '2026-10-26' });
  assert.deepEqual(completed.map(entry => entry.title).sort(), ['completed-practice', 'completed-standalone']);
  assert.ok(completed.every(entry => entry.date === '2026-10-26'));
  assert.deepEqual(record, before);
});

test('weekly and monthly summaries apply the optional policy to unopened old records while retaining practice time', () => {
  const records: StudyRecord[] = [{ date: '2026-10-26', items: [
    item('required', { done: true, minutes: '10' }),
    item('practice', { type: 'interactiveDaily', f: { interactiveEntries: [
      item('done', { type: 'mathOral', done: true, minutes: '25' }), item('not-done', { type: 'biologyInteractive' }),
    ] } }),
  ] }];
  const before = structuredClone(records);
  for (const mode of ['week', 'month'] as const) {
    const result = summarizeLearningPeriod(records, summaryPeriod('2026-10-26', mode));
    assert.equal(result.completion.itemTotal, 1);
    assert.equal(result.completion.workloadTotal, 1);
    assert.equal(result.completion.settlementPercent, 100);
    assert.equal(result.subjectTime.totalMinutes, 35);
    assert.equal(result.days.find(day => day.date === '2026-10-26')?.completionPercent, 100);
  }
  assert.deepEqual(records, before);
});

test('other custom optional tasks still follow their existing workload rule', () => {
  const record: StudyRecord = { date: '2026-10-26', items: [
    item('required', { done: true }), item('custom', { required: false, source: 'custom' }),
    item('interactive', { type: 'englishPractice', required: false, source: 'custom' }),
  ] };
  const result = summarizeCompletionUnits(summaryCompletionUnitsForRecord(record));
  assert.equal(result.itemTotal, 1);
  assert.equal(result.workloadTotal, 2);
  assert.equal(result.workloadPercent, 50);
});
