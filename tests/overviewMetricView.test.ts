import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { OVERVIEW_METRICS, adjacentOverviewMetric, normalizeOverviewMetric, overviewMetricIndex } from '../src/ui/overviewMetricView.ts';

test('public metrics switch between completion and yesterday reminders without restoring math panels', () => {
  assert.deepEqual(OVERVIEW_METRICS, ['completion', 'reminder']);
  assert.equal(normalizeOverviewMetric('pages'), 'completion');
  assert.equal(normalizeOverviewMetric(undefined), 'completion');
  assert.equal(overviewMetricIndex('reminder'), 1);
  assert.equal(adjacentOverviewMetric('completion', 1), 'reminder');
  assert.equal(adjacentOverviewMetric('completion', -1), 'reminder');
  assert.equal(adjacentOverviewMetric('reminder', 1), 'completion');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /今日數學頁數|本週數學頁數|metricMathTodayPanel|metricMathWeekPanel/);
  assert.match(html, /id="yesterdayReminderPanel"/);
});
