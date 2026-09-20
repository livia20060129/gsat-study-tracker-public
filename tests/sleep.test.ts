import assert from 'node:assert/strict';
import test from 'node:test';

import {
  averageBedtimeClockMinutes,
  bedtimeRecordForStudyDate,
  formatClockMinutes,
  sleepComparisonText,
  sleepDayForWakeDate,
  summarizeSleepPeriod,
} from '../src/study/sleep.ts';
import { summarizeLearningPeriod, summaryPeriod } from '../src/study/learningSummary.ts';
import type { StudyRecord } from '../src/types.ts';

function record(date: string, wakeTime = '', bedtimeTime = ''): StudyRecord {
  const bedtime = bedtimeTime ? bedtimeRecordForStudyDate(date, bedtimeTime) ?? undefined : undefined;
  return { date, wakeTime, bedtime, items: [] };
}

test('bedtime keeps an explicit date and treats only 00:00-05:59 as next-day', () => {
  assert.deepEqual(bedtimeRecordForStudyDate('2026-09-20', '23:45'), {
    time: '23:45', dateTime: '2026-09-20T23:45', nextDay: false,
  });
  assert.deepEqual(bedtimeRecordForStudyDate('2026-09-20', '01:30'), {
    time: '01:30', dateTime: '2026-09-21T01:30', nextDay: true,
  });
  assert.equal(bedtimeRecordForStudyDate('2026-09-20', '06:00')?.nextDay, false);
});

test('sleep duration uses previous bedtime and the wake date', () => {
  const records = [record('2026-09-20', '', '23:45'), record('2026-09-21', '07:20')];
  const day = sleepDayForWakeDate(new Map(records.map(entry => [entry.date, entry])), '2026-09-21');
  assert.equal(day.status, 'valid');
  assert.equal(day.sleepMinutes, 7 * 60 + 35);
});

test('next-day bedtime calculates against the same next-day wake date', () => {
  const records = [record('2026-09-20', '', '01:30'), record('2026-09-21', '08:00')];
  const day = sleepDayForWakeDate(new Map(records.map(entry => [entry.date, entry])), '2026-09-21');
  assert.equal(day.status, 'valid');
  assert.equal(day.sleepMinutes, 6 * 60 + 30);
});

test('missing data and durations over eighteen hours are excluded from averages', () => {
  const records = [
    record('2026-09-13', '', '23:45'),
    record('2026-09-14', '07:20'),
    record('2026-09-15', '08:00'),
    record('2026-09-16', '', '06:00'),
    record('2026-09-17', '08:00'),
  ];
  const summary = summarizeSleepPeriod(records, ['2026-09-14', '2026-09-15', '2026-09-17']);
  assert.equal(summary.days[0].status, 'valid');
  assert.equal(summary.days[1].status, 'incomplete');
  assert.equal(summary.days[1].statusText, '資料不完整');
  assert.equal(summary.days[2].status, 'invalid');
  assert.equal(summary.days[2].statusText, '請確認時間');
  assert.equal(summary.validNightCount, 1);
  assert.equal(summary.averageSleepMinutes, 455);
});

test('average bedtime crosses midnight instead of averaging to noon', () => {
  const average = averageBedtimeClockMinutes([23 * 60 + 50, 10]);
  assert.equal(formatClockMinutes(average), '00:00');
});

test('period first day reads the preceding record and includes state days', () => {
  const previous = record('2026-09-13', '', '23:30');
  const first = record('2026-09-14', '07:00');
  first.mood = '身體不適';
  const secondBedtime = record('2026-09-14', '07:00', '00:30');
  secondBedtime.mood = '外出';
  const second = record('2026-09-15', '08:00');
  second.mood = '較疲累';
  const summary = summarizeSleepPeriod([previous, secondBedtime, second], ['2026-09-14', '2026-09-15']);
  assert.equal(summary.validNightCount, 2);
  assert.deepEqual(summary.days.map(day => day.sleepMinutes), [450, 450]);
});

test('sleep comparison uses fixed deterministic wording', () => {
  assert.equal(sleepComparisonText(480, 445), '平均多睡 35 分鐘');
  assert.equal(sleepComparisonText(420, 490), '平均少睡 1 小時 10 分鐘');
  assert.equal(sleepComparisonText(480, 477), '大致持平');
  assert.equal(sleepComparisonText(null, 477), '資料不足');
});

test('bedtime fields never change learning completion or study time', () => {
  const base: StudyRecord = {
    date: '2026-09-14',
    wakeTime: '07:00',
    items: [{ id: 'math', type: 'mathStudy', done: true, minutes: '30', required: true, f: { subject: '數學' } }],
  };
  const withSleep: StudyRecord = { ...base, bedtime: bedtimeRecordForStudyDate(base.date, '23:45') ?? undefined };
  const period = summaryPeriod(base.date, 'week');
  const before = summarizeLearningPeriod([base], period);
  const after = summarizeLearningPeriod([withSleep], period);
  assert.deepEqual(after.completion, before.completion);
  assert.deepEqual(after.subjectTime, before.subjectTime);
});
