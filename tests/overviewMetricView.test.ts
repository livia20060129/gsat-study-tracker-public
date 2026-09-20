import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('daily overview keeps the completed-time subject donut', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /id="overviewStats"/);
  assert.match(html, /class="overview-metric-title">今日完成時間<\/div>/);
  assert.match(html, /id="metricMinutesPanel"/);
  assert.match(html, /id="subjectTimeDonut"/);
});

test('daily overview no longer renders either math page statistic', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  assert.doesNotMatch(html, /今日數學頁數|本週數學頁數/);
  assert.doesNotMatch(html, /overviewMetricTabs|metricMathTodayPanel|metricMathWeekPanel/);
  assert.doesNotMatch(html, /mathPagesTop|weekMathPages|weekMathTarget|weekMathBar|weekMathPercent/);
});

test('daily overview runtime no longer calculates or switches math metrics', () => {
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(runtime, /overviewMetricView|overviewMetricTabs|updateOverviewMetricView/);
  assert.doesNotMatch(runtime, /MathProgressIndex|calculateMathProgress|mathProgressIndex/);
  assert.equal(existsSync(new URL('../src/study/mathProgressHistory.ts', import.meta.url)), false);
});

test('completed-time panel remains sized while completion metrics stay aligned', () => {
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

  assert.match(styles, /overview-metric-title\{[^}]*font-size:13px/);
  assert.match(styles, /metric-minutes-panel\{[^}]*display:flex;[^}]*min-height:282px/);
  assert.match(styles, /completion-stat #completionRatePanel\{grid-template-columns:minmax\(0,420px\);justify-content:center;align-content:center/);
  assert.match(styles, /completion-stat \.completion-metric-head\{flex-direction:row;align-items:baseline;justify-content:space-between;text-align:left\}/);
  assert.match(styles, /completion-stat \.completion-metric \.small\{text-align:left\}/);
  assert.doesNotMatch(styles, /metric-panel-stage|metric-math-panel|metric-segments/);
});
