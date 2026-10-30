import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  adjacentOverviewMetric,
  normalizeOverviewMetric,
  overviewMetricIndex,
} from '../src/ui/overviewMetricView.ts';

test('normalizes the three overview metric segments', () => {
  assert.equal(normalizeOverviewMetric('minutes'), 'minutes');
  assert.equal(normalizeOverviewMetric('mathToday'), 'mathToday');
  assert.equal(normalizeOverviewMetric('mathWeek'), 'mathWeek');
  assert.equal(normalizeOverviewMetric('unknown'), 'minutes');
});

test('returns the correct slider position for every segment', () => {
  assert.equal(overviewMetricIndex('minutes'), 0);
  assert.equal(overviewMetricIndex('mathToday'), 1);
  assert.equal(overviewMetricIndex('mathWeek'), 2);
});

test('keyboard segment navigation wraps in both directions', () => {
  assert.equal(adjacentOverviewMetric('minutes', 1), 'mathToday');
  assert.equal(adjacentOverviewMetric('mathWeek', 1), 'minutes');
  assert.equal(adjacentOverviewMetric('minutes', -1), 'mathWeek');
});

test('overview keeps only the completed-time panel and centered completion metrics', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const runtime = readFileSync(new URL('../src/legacy-app.ts', import.meta.url), 'utf8');

  assert.match(html, /id="overviewStats"/);
  assert.match(html, /class="overview-metric-title">今日完成時間/);
  assert.doesNotMatch(html, /今日數學頁數|本週數學頁數|metricMathTodayPanel|metricMathWeekPanel/);
  assert.doesNotMatch(runtime, /overviewMetricTabs|updateOverviewMetricView/);
  assert.match(styles, /completion-stat #completionRatePanel\{grid-template-columns:minmax\(0,420px\);justify-content:center;align-content:center/);
  assert.match(styles, /completion-stat \.completion-metric-head\{flex-direction:row;align-items:baseline;justify-content:space-between;text-align:left\}/);
  assert.match(styles, /completion-stat \.completion-metric \.small\{text-align:left\}/);
});
