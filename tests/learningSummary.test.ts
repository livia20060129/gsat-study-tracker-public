import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  calendarLeadingBlankCount,
  completionIncludedInPeriod,
  completedStudyTimeEntries,
  completedSubjectTimeForRecord,
  fixedPeriodRemarks,
  groupedSummarySubjectTime,
  shiftSummaryAnchor,
  summarizeLearningPeriod,
  summarizeNaturalScienceTime,
  summarizeStudyItemTime,
  summaryCompletionUnitsForRecord,
  summaryPeriod,
} from '../src/study/learningSummary.ts';
import { summarizeCompletionUnits } from '../src/study/completionMetrics.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, done: boolean, minutes: string, subject: string, required = true): StudyItem {
  return { id, type: 'general', done, minutes, required, source: required ? 'preset' : 'custom', f: { subject } };
}

function record(date: string, items: StudyItem[], wakeTime = ''): StudyRecord {
  return { date, items, wakeTime };
}

test('one anchor creates a Monday-to-Sunday week or the complete selected month', () => {
  const week = summaryPeriod('2026-09-17', 'week');
  assert.equal(week.start, '2026-09-14');
  assert.equal(week.end, '2026-09-20');
  assert.equal(week.dates.length, 7);

  const month = summaryPeriod('2026-09-17', 'month');
  assert.equal(month.start, '2026-09-01');
  assert.equal(month.end, '2026-09-30');
  assert.equal(month.dates.length, 30);
  assert.equal(calendarLeadingBlankCount(month), 1);
});

test('previous and next controls move the shared anchor by exactly one period', () => {
  assert.equal(shiftSummaryAnchor('2026-09-17', 'week', -1), '2026-09-10');
  assert.equal(shiftSummaryAnchor('2026-09-17', 'week', 1), '2026-09-24');
  assert.equal(shiftSummaryAnchor('2026-09-17', 'month', -1), '2026-08-01');
  assert.equal(shiftSummaryAnchor('2026-09-17', 'month', 1), '2026-10-01');
});

test('summary reuses completion rules and only counts time on completed work', () => {
  const studyRecord = record('2026-09-15', [
    item('done-math', true, '30', '數學A'),
    item('open-english', false, '45', '英文'),
    item('custom-chinese', true, '15', '國文', false),
  ], '06:40');

  const completion = summarizeCompletionUnits(summaryCompletionUnitsForRecord(studyRecord));
  assert.equal(completion.itemCompleted, 1);
  assert.equal(completion.itemTotal, 2);
  assert.equal(completion.workloadCompleted, 2);
  assert.equal(completion.workloadTotal, 3);

  const subjectTime = completedSubjectTimeForRecord(studyRecord);
  assert.equal(subjectTime.totalMinutes, 45);
  assert.deepEqual(subjectTime.slices.map(slice => slice.subject), ['數學', '國文']);
});

test('completed minutes belong to the actual check date for both past and future source dates', () => {
  const past = item('past', true, '20', '數學');
  past.checkedOn = '2026-09-17';
  const sameDay = item('same-day', true, '10', '國文');
  const future = item('future', true, '40', '英文');
  future.checkedOn = '2026-09-17';
  const records = [
    record('2026-09-16', [past]),
    record('2026-09-17', [sameDay]),
    record('2026-09-18', [future]),
  ];

  const entries = completedStudyTimeEntries(records);
  assert.deepEqual(entries.map(entry => entry.date), ['2026-09-17', '2026-09-17', '2026-09-17']);
  const summary = summarizeLearningPeriod(records, summaryPeriod('2026-09-17', 'week'));
  assert.equal(summary.days.find(day => day.date === '2026-09-16')?.totalMinutes, 0);
  assert.equal(summary.days.find(day => day.date === '2026-09-17')?.totalMinutes, 70);
  assert.equal(summary.days.find(day => day.date === '2026-09-18')?.totalMinutes, 0);
  assert.equal(summary.subjectTime.totalMinutes, 70);
});

test('a checked item from outside the selected period is counted inside its actual check period', () => {
  const source = item('previous-week', true, '25', '英文');
  source.checkedOn = '2026-09-14';
  const summary = summarizeLearningPeriod(
    [record('2026-09-13', [source])],
    summaryPeriod('2026-09-14', 'week'),
  );

  assert.equal(summary.records.length, 0);
  assert.equal(summary.days[0].totalMinutes, 25);
  assert.equal(summary.days[0].hasRecord, true);
  assert.equal(summary.subjectTime.totalMinutes, 25);
  assert.equal(summary.recordedDayCount, 1);
});

test('a grouped parent check date is inherited by completed child time', () => {
  const child = item('child', true, '15', '自然');
  const parent = item('parent', true, '', '自然');
  parent.checkedOn = '2026-09-17';
  parent.f.groupedWorkEntries = [child];

  const entries = completedStudyTimeEntries([record('2026-09-16', [parent])]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].date, '2026-09-17');
  assert.equal(entries[0].minutes, 15);
});

test('learning summary separates natural science into physics, chemistry, biology, and earth science', () => {
  const scienceItems: StudyItem[] = [
    { id: 'physics', type: 'scienceReview', title: '物理｜運動學', done: true, minutes: '10', required: true, f: { subject: '物理' } },
    { id: 'physics-force', type: 'scienceReview', title: '物理｜力學', done: true, minutes: '5', required: true, f: { subject: '物理' } },
    { id: 'chemistry', type: 'scienceReview', title: '化學｜化學反應', done: true, minutes: '20', required: true, f: { subject: '化學' } },
    { id: 'biology', type: 'biologyInteractive', title: '生物｜細胞', done: true, minutes: '30', required: true, f: { subject: '生物' } },
    { id: 'earth', type: 'scienceReview', title: '地科｜地質', done: true, minutes: '40', required: true, f: { subject: '地科' } },
  ];
  const entries = completedStudyTimeEntries([record('2026-09-15', scienceItems)]);
  const summary = summarizeLearningPeriod(
    [record('2026-09-15', scienceItems)],
    summaryPeriod('2026-09-15', 'week'),
  );

  assert.deepEqual([...new Set(entries.map(entry => entry.subject))].sort(), ['物理', '化學', '生物', '地科'].sort());
  assert.deepEqual(summary.subjectTime.slices.map(slice => slice.subject), ['物理', '化學', '生物', '地科']);
  const overview = groupedSummarySubjectTime(entries);
  assert.deepEqual(overview.slices.map(slice => slice.subject), ['自然']);
  assert.equal(overview.slices[0].minutes, 105);
  const naturalDetail = summarizeNaturalScienceTime(entries);
  assert.deepEqual(
    naturalDetail.slices.map(slice => slice.label),
    ['物理｜運動學', '物理｜力學', '化學｜化學反應', '生物｜互動題', '地科｜地質'],
  );
  assert.deepEqual(naturalDetail.slices.map(slice => slice.minutes), [10, 5, 20, 30, 40]);
  assert.deepEqual(naturalDetail.slices.map(slice => slice.subject), ['物理', '物理', '化學', '生物', '地科']);
  assert.equal(naturalDetail.slices.reduce((sum, slice) => sum + slice.percent, 0), 100);
});

test('all overview blocks derive from the same requested period', () => {
  const period = summaryPeriod('2026-09-17', 'week');
  const summary = summarizeLearningPeriod([
    record('2026-09-14', [item('math', true, '20', '數學')], '06:30'),
    record('2026-09-15', [item('english', false, '40', '英文')], '07:00'),
    record('2026-09-22', [item('outside', true, '100', '自然')], '05:00'),
  ], period);

  assert.equal(summary.records.length, 2);
  assert.equal(summary.subjectTime.totalMinutes, 20);
  assert.equal(summary.days.length, 7);
});

test('summary days preserve mood for calendar status colors', () => {
  const unwell = record('2026-09-14', []);
  unwell.mood = '身體不適';
  const tired = record('2026-09-15', []);
  tired.mood = '較疲累';
  const outside = record('2026-09-16', []);
  outside.mood = '外出';
  const summary = summarizeLearningPeriod([unwell, tired, outside], summaryPeriod('2026-09-14', 'week'));

  assert.equal(summary.days[0].mood, '身體不適');
  assert.equal(summary.days[1].mood, '較疲累');
  assert.equal(summary.days[2].mood, '外出');
  assert.equal(summary.days[3].mood, '');
});

test('outside and unwell days keep daily progress but do not affect week or month completion', () => {
  const normal = record('2026-09-14', [item('normal-done', true, '20', '數學')]);
  const unwell = record('2026-09-15', [
    item('unwell-done', true, '10', '英文'),
    item('unwell-open', false, '', '英文'),
  ]);
  unwell.mood = '身體不適';
  const outside = record('2026-09-16', [
    item('outside-preset-done', true, '15', '國文'),
    item('outside-preset-open', false, '', '國文'),
  ]);
  outside.mood = '外出';

  const summary = summarizeLearningPeriod([normal, unwell, outside], summaryPeriod('2026-09-14', 'week'));

  const unwellDailyCompletion = summarizeCompletionUnits(summaryCompletionUnitsForRecord(unwell)).settlementPercent;
  const outsideDailyCompletion = summarizeCompletionUnits(summaryCompletionUnitsForRecord(outside)).settlementPercent;
  assert.ok(unwellDailyCompletion > 0);
  assert.ok(outsideDailyCompletion > 0);
  assert.equal(summary.days[1].completionPercent, unwellDailyCompletion);
  assert.equal(summary.days[1].completionIncludedInPeriod, false);
  assert.equal(summary.days[2].completionPercent, outsideDailyCompletion);
  assert.equal(outsideDailyCompletion, 50);
  assert.equal(summary.days[2].completionIncludedInPeriod, false);
  assert.equal(summary.completion.settlementPercent, 100);
  assert.equal(summary.subjectTime.totalMinutes, 45);
  assert.equal(completedStudyTimeEntries([outside]).some(entry => entry.key.includes('outside-preset-done')), true);
  assert.equal(completionIncludedInPeriod(normal), true);
  assert.equal(completionIncludedInPeriod(unwell), false);
  assert.equal(completionIncludedInPeriod(outside), false);

  const summaryWithStatusDays = summarizeLearningPeriod(
    [normal, unwell, outside],
    summaryPeriod('2026-09-14', 'week'),
    { includeStatusDaysInCompletion: true },
  );
  assert.equal(summaryWithStatusDays.completion.settlementPercent, 60);
  assert.equal(summaryWithStatusDays.days[1].completionIncludedInPeriod, true);
  assert.equal(summaryWithStatusDays.days[2].completionIncludedInPeriod, true);
});

test('completed time deduplicates deferred copies and item drilldown totals', () => {
  const deferredOriginal = item('origin', true, '30', '英文');
  deferredOriginal.deferred = true;
  deferredOriginal.deferredTargetDay = 3;
  const carried = item('carry-a', true, '30', '英文');
  carried.deferredCarry = true;
  carried.deferredOriginId = 'origin';
  carried.title = '英文閱讀';
  const duplicate = { ...carried, id: 'carry-b' };
  const entries = completedStudyTimeEntries([
    record('2026-09-15', [deferredOriginal]),
    record('2026-09-16', [carried, duplicate]),
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].minutes, 30);
  const detail = summarizeStudyItemTime(entries, '英文');
  assert.equal(detail.totalMinutes, 30);
  assert.equal(detail.slices.reduce((sum, slice) => sum + slice.percent, 0), 100);
});

test('subject drilldown omits repeated subject names and separates lecture versions', () => {
  const entries = completedStudyTimeEntries([record('2026-09-16', [
    { id: 'math-teaching', type: 'mathStudy', done: true, minutes: '20', required: true, f: { material: '教學講義', book: '2' } },
    { id: 'math-key', type: 'mathStudy', done: true, minutes: '25', required: true, f: { material: '新關鍵', book: '1~2' } },
    { id: 'english-reading', type: 'englishPractice', title: '英文閱讀', done: true, minutes: '15', required: true, f: { subject: '英文' } },
  ])]);

  assert.deepEqual(
    entries.filter(entry => entry.subject === '數學').map(entry => entry.itemLabel).sort(),
    ['教學講義 2冊｜進度', '新關鍵 1~2冊｜進度'].sort(),
  );
  assert.equal(entries.find(entry => entry.subject === '英文')?.itemLabel, '閱讀');
  assert.ok(entries.every(entry => !entry.itemLabel.startsWith(entry.subject)));
});

test('round-based Chinese reading records merge into one material item in subject drilldown', () => {
  const entries = completedStudyTimeEntries([record('2026-09-16', [
    { id: 'gujin-1', type: 'chineseReading', title: '國文｜古今悅讀一百 第 1 回', done: true, minutes: '20', required: true, f: { kind: 'reading', round: '1' } },
    { id: 'gujin-2', type: 'chineseReading', title: '國文｜古今悅讀一百 第 2 回', done: true, minutes: '25', required: true, f: { kind: 'reading', round: '2' } },
  ])]);
  const detail = summarizeStudyItemTime(entries, '國文');

  assert.deepEqual(detail.slices, [{ label: '古今悅讀一百', minutes: 45, percent: 100 }]);
});

test('CNN Interactive English and Ivy magazine time merge into one magazine item', () => {
  const entries = completedStudyTimeEntries([record('2026-09-16', [
    { id: 'cnn', type: 'magazine', title: 'CNN互動英文', done: true, minutes: '20', required: true, source: 'custom', f: { subject: '英文' } },
    { id: 'ivy', type: 'magazine', title: '常春藤', done: true, minutes: '40', required: true, source: 'custom', f: { subject: '英文' } },
  ])]);
  const detail = summarizeStudyItemTime(entries, '英文');

  assert.deepEqual(detail.slices, [{ label: '雜誌', minutes: 60, percent: 100 }]);
});

test('all completed past-paper and mock-exam variants merge into one drilldown item', () => {
  const entries = completedStudyTimeEntries([record('2026-09-16', [
    { id: 'timed-mock', type: 'mock', title: '英文歷屆／模考：限時作答', done: true, minutes: '40', required: true, source: 'preset', f: { subject: '英文' } },
    { id: 'mock-review', type: 'mock', title: '英文歷屆／模考：批改與訂正', done: true, minutes: '25', required: true, source: 'preset', f: { subject: '英文' } },
    { id: 'legacy-mock', type: 'englishPractice', title: '歷屆/模考', done: true, minutes: '15', required: true, source: 'custom', f: { subject: '英文' } },
  ])]);
  const detail = summarizeStudyItemTime(entries, '英文');

  assert.deepEqual(detail.slices, [{ label: '歷屆／模考', minutes: 80, percent: 100 }]);
});

test('fixed remarks are deterministic and use the requested five-percent thresholds', () => {
  const stable = fixedPeriodRemarks(104, 100, 74, 70);
  assert.equal(stable.timeState, 'stable');
  assert.equal(stable.completionState, 'stable');
  assert.equal(stable.time, '本期學習時數大致穩定，可以繼續觀察目前安排是否適合。');
  assert.equal(stable.completion, '本期完成率大致穩定，可繼續維持並觀察較常卡住的項目。');

  const increase = fixedPeriodRemarks(105, 100, 75, 70);
  assert.equal(increase.timeState, 'increase');
  assert.equal(increase.completionState, 'increase');
  assert.equal(increase.time, '本期學習時數增加，建議維持目前節奏，同時留意休息與負荷。');
  assert.equal(increase.completion, '本期完成率提升，可以觀察哪些安排有助於任務順利完成。');

  const decrease = fixedPeriodRemarks(94.9, 100, 64.9, 70);
  assert.equal(decrease.timeState, 'decrease');
  assert.equal(decrease.completionState, 'decrease');
  assert.equal(decrease.time, '本期學習時數下降，可回顧近期狀態與排程，確認是否需要調整。');
  assert.equal(decrease.completion, '本期完成率下降，可檢查是否有任務過多、延期集中或安排不適合的情況。');
});

test('summary page has one global week/month switch and no separate total-hours card', () => {
  const html = readFileSync(new URL('../summary.html', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  const sharedHeaderActions = readFileSync(new URL('../src/header-action-link.css', import.meta.url), 'utf8');
  assert.equal((html.match(/id="summaryModeSwitch"/g) || []).length, 1);
  assert.equal((html.match(/data-summary-mode=/g) || []).length, 2);
  assert.match(html, /id="summaryTotalCompletion"/);
  assert.match(html, /id="includeStatusDaysCompletion"[^>]*role="switch"/);
  assert.match(html, /id="statusDaysCompletionState">不列入/);
  assert.doesNotMatch(html, /summary-heading-icon/);
  assert.doesNotMatch(html, /總時數/);
  assert.match(html, /圓內深淺＝當日學習時數/);
  assert.match(html, /亮綠完整圓環＝100% 完成/);
  assert.match(html, /紅色圓心＝身體不適/);
  assert.match(html, /橘色圓心＝疲倦/);
  assert.match(html, /黃色圓心＝外出/);
  assert.doesNotMatch(html, /深綠完整圓環/);
  assert.doesNotMatch(html, /id="subjectBack"|返回全部科目<\/button>/);
  const runtime = readFileSync(new URL('../src/learning-summary-page.ts', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/learning-summary.css', import.meta.url), 'utf8');
  assert.match(runtime, /summaryTotalCompletion'\)\.textContent = `\$\{current\.completion\.settlementPercent\}%`/);
  assert.match(runtime, /STATUS_DAY_COMPLETION_STORAGE_KEY/);
  assert.match(runtime, /summarizeLearningPeriod\(records, period, completionOptions\)/);
  assert.doesNotMatch(runtime, /fetch\(|openai|anthropic|gemini/i);
  assert.match(runtime, /data-summary-back/);
  assert.match(runtime, /function returnToSubjectOverview\(\)/);
  assert.match(runtime, /groupedSummarySubjectTime\(summary\.timeEntries\)/);
  assert.match(runtime, /selectedSubject === '自然'/);
  assert.match(runtime, /summarizeNaturalScienceTime\(summary\.timeEntries\)/);
  assert.match(runtime, /summary-donut-return-overlay/);
  assert.match(runtime, /destinationRect\.left - sourceRect\.left/);
  assert.match(styles, /\.summary-donut-return-overlay\{/);
  assert.doesNotMatch(styles, /pointer-events:bounding-box/);
  assert.match(runtime, /--day-time-color:\$\{timeColor\}/);
  assert.match(runtime, /summaryMoodClass\(day\.mood\)/);
  assert.match(runtime, /function summaryMoodColor\(mood: string, opacity: number\)/);
  assert.match(runtime, /身體不適'\) return `rgb\(255 117 117 \/ \$\{opacity\}\)`/);
  assert.match(runtime, /較疲累'.*較疲倦'.*return `rgb\(255 199 142 \/ \$\{opacity\}\)`/);
  assert.match(runtime, /外出'\) return `rgb\(255 240 189 \/ \$\{opacity\}\)`/);
  assert.doesNotMatch(runtime, /summaryMoodColor[\s\S]{0,500}hsl\(/);
  assert.match(styles, /background:var\(--day-core-color\)/);
  assert.doesNotMatch(styles, /var\(--day-core-color,var\(--day-time-color\)\)/);
  assert.doesNotMatch(styles, /color-mix\(in srgb,var\(--day-mood-color/);
  assert.match(runtime, /function summaryMoodOpacity\(totalMinutes: number, maxMinutes: number\)/);
  assert.match(runtime, /totalMinutes <= 0 \|\| maxMinutes <= 0\) return 0\.38/);
  assert.match(runtime, /0\.45 \+ 0\.55 \* Math\.min\(1, totalMinutes \/ maxMinutes\)/);
  assert.match(runtime, /--day-core-color:\$\{coreColor\}/);
  assert.match(runtime, /toFixed\(1\)/);
  assert.match(runtime, /<span>hr<\/span>/);
  assert.match(styles, /background:var\(--day-time-color\)/);
  assert.doesNotMatch(styles, /background:rgba\([^)]*var\(--day-intensity\)/);
  assert.match(styles, /\.summary-day-ring::before\{[^}]*mask:radial-gradient/);
  assert.match(styles, /\.summary-day-ring\{--day-ring-width:6px;position:relative;background:transparent\}/);
  assert.match(styles, /\.summary-day\.is-complete\{--day-accent:#70DE43\}/);
  assert.match(styles, /\.legend-complete\{border-color:#70DE43\}/);
  assert.match(styles, /\.legend-unwell\{[^}]*background:#ff7575\}/);
  assert.match(styles, /\.legend-tired\{[^}]*background:#ffc78e\}/);
  assert.match(styles, /\.legend-out\{[^}]*background:#fff0bd\}/);
  assert.doesNotMatch(html, /summary-side-stack/);
  assert.match(html, /summary-conclusion-card[\s\S]*id="summaryComparison"[\s\S]*id="summaryConclusion"/);
  assert.match(html, /summary-personal-card[\s\S]*id="averageSleepDuration"[\s\S]*id="averageBedtime"[\s\S]*id="averageWakeTime"[\s\S]*id="validSleepCount"/);
  assert.match(html, /id="sleepTrend"[\s\S]*id="sleepComparisonValue"/);
  assert.doesNotMatch(html, /id="wakeComparisonLabel"|id="wakeComparisonValue"/);
  assert.doesNotMatch(runtime, /<dt>平均起床<\/dt>/);
  assert.match(runtime, /summarizeSleepPeriod\(records, period\.dates\)/);
  assert.match(runtime, /sleepComparisonText\(current\.averageSleepMinutes, previous\.averageSleepMinutes\)/);
  assert.doesNotMatch(runtime, /averageWakeMinutes.*current\.completion|subjectTime.*averageWakeMinutes/);
  assert.match(styles, /summary-subject-detail-list\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(styles, /summary-subject-detail-list\{display:grid;grid-template-columns:none;grid-template-rows:repeat\(var\(--summary-detail-rows,1\),auto\);grid-auto-flow:column/);
  assert.match(runtime, /const detailRows = Math\.max\(1, Math\.min\(4, slices\.length\)\)/);
  assert.match(runtime, /--summary-detail-rows:\$\{detailRows\}/);
  assert.match(runtime, /pendingSubjectEntryOrigin/);
  assert.match(runtime, /entryOrigin\.left \+ entryOrigin\.width \/ 2/);
  assert.match(styles, /summary-day-tooltip\{display:block;visibility:hidden;opacity:0/);
  assert.match(styles, /grid-template-columns:minmax\(100px,116px\) minmax\(0,1fr\)/);
  assert.match(styles, /@media\(max-width:650px\)\{\.summary-page\{padding-top:16px\}/);
  assert.match(styles, /\.summary-heading h1\{font-size:28px\}/);
  assert.match(styles, /\.summary-back\{width:100%\}/);
  assert.match(styles, /\.summary-mode-switch>span\{background:#528bd0/);
  assert.match(styles, /summary-dashboard-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(runtime, /trend-time-tick/);
  assert.match(runtime, /\$\{timeTick\} hr/);
  assert.match(runtime, /formatWholeDuration\(point\.totalMinutes\)/);
  assert.match(styles, /summary-conclusion article\.is-flat\{background:#edf5fc\}/);
  assert.match(runtime, /remarkClass\[remarks\.timeState\]/);
  assert.match(runtime, /remarkClass\[remarks\.completionState\]/);
  assert.match(html, /id="summaryContent"/);
  assert.match(runtime, /function switchSummaryMode\(mode: SummaryMode\)/);
  assert.match(runtime, /exit\.cancel\(\);\s*applyMode\(\);/);
  assert.match(runtime, /height: `\$\{beforeHeight\}px`/);
  assert.match(html, /<div class="summary-view-controls">\s*<a class="summary-back header-action-link"[^>]*>回到 Tracker<\/a>\s*<div class="summary-mode-switch"/);
  assert.match(index, /class="header-action-link" href="\.\/summary\.html">週／月總結<\/a>/);
  assert.doesNotMatch(index, /本週趨勢|completionTrendPanel|completionViewTabs/);
  assert.match(styles, /@import "\.\/header-action-link\.css"/);
  assert.match(sharedHeaderActions, /\.header-action-link\{/);
  assert.match(config, /learningSummary:\s*'\.\/summary\.html'/);
});
