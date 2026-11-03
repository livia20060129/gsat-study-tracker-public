import assert from 'node:assert/strict';
import test from 'node:test';
import { completedStudyTimeEntries, summarizeLearningPeriod, summaryPeriod } from '../src/study/learningSummary.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function task(id: string, minutes: number, checkedOn?: string): StudyItem {
  return { id, type: 'general', done: true, required: true, minutes: String(minutes), checkedOn, f: { subject: '英文' } };
}

test('trend classifies old work by original and completion dates across week/month boundaries without changing totals', () => {
  const records: StudyRecord[] = [
    { date: '2026-09-30', items: [task('old', 30, '2026-10-01'), { ...task('open', 45), done: false }] },
    { date: '2026-10-01', mood: '外出', items: [task('today', 20)] },
    { date: '2026-10-04', items: [task('early', 10, '2026-10-01')] },
  ];
  for (const mode of ['week', 'month'] as const) {
    const summary = summarizeLearningPeriod(records, summaryPeriod('2026-10-01', mode));
    const day = summary.days.find(day => day.date === '2026-10-01')!;
    assert.equal(day.totalMinutes, 60);
    assert.equal(day.makeupMinutes, 30);
    assert.equal(summary.subjectTime.totalMinutes, 60);
    assert.equal(day.completionPercent, 100);
    assert.equal(day.completionIncludedInPeriod, false);
    assert.equal(summary.days.find(day => day.date === '2026-10-02')!.makeupMinutes, 0);
  }
});

test('grouped and deferred entries inherit their schedule separately from their completion date', () => {
  const records: StudyRecord[] = [{ date: '2026-10-02', items: [{
    ...task('group', 999, '2026-10-03'), deferredOriginDate: '2026-09-29',
    f: { subject: '自然', groupedWorkEntries: [
      task('child-old', 25),
      { ...task('child-current', 15, '2026-10-02'), deferredOriginDate: '2026-10-02' },
    ] },
  }] }];
  const entries = completedStudyTimeEntries(records);
  assert.deepEqual(entries.map(entry => [entry.minutes, entry.date, entry.scheduledDate]), [
    [15, '2026-10-02', '2026-10-02'], [25, '2026-10-03', '2026-09-29'],
  ]);
  const summary = summarizeLearningPeriod(records, summaryPeriod('2026-10-02', 'month'));
  assert.equal(summary.subjectTime.totalMinutes, 40);
  assert.equal(summary.days.find(day => day.date === '2026-10-02')!.makeupMinutes, 0);
  assert.equal(summary.days.find(day => day.date === '2026-10-03')!.makeupMinutes, 25);
});

test('deduplicated Calendar copies retain the original schedule even when the later copy has more minutes', () => {
  const original = { ...task('source', 20, '2026-10-02'), f: { subject: '英文', calendarEventKey: 'one-event' } };
  const later = { ...original, id: 'copy', minutes: '40' };
  const records: StudyRecord[] = [{ date: '2026-09-30', items: [original] }, { date: '2026-10-02', items: [later] }];
  for (const order of [records, [...records].reverse()]) {
    const summary = summarizeLearningPeriod(order, summaryPeriod('2026-10-02', 'month'));
    assert.equal(summary.timeEntries.length, 1);
    assert.equal(summary.subjectTime.totalMinutes, 40);
    assert.equal(summary.days[1].makeupMinutes, 40);
  }
});
