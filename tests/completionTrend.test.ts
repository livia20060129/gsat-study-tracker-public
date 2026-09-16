import assert from 'node:assert/strict';
import test from 'node:test';

import {
  adjacentCompletionView,
  completionTrendDayCount,
  completionTrendPoints,
  normalizeCompletionView,
} from '../src/ui/completionTrend.ts';

test('completion trend is available only on Friday and Sunday', () => {
  assert.equal(completionTrendDayCount(5), 5);
  assert.equal(completionTrendDayCount(0), 7);
  for (const weekday of [1, 2, 3, 4, 6]) {
    assert.equal(completionTrendDayCount(weekday), 0);
  }
});

test('completion view falls back to rates when trend is unavailable', () => {
  assert.equal(normalizeCompletionView('trend', false), 'rates');
  assert.equal(normalizeCompletionView('trend', true), 'trend');
  assert.equal(normalizeCompletionView('unknown', true), 'rates');
  assert.equal(adjacentCompletionView('rates', 1), 'trend');
  assert.equal(adjacentCompletionView('trend', 1), 'rates');
});

test('trend points clamp percentages and cover the chart from left to right', () => {
  const points = completionTrendPoints([-10, 50, 105], ['一', '二', '三']);
  assert.deepEqual(points.map(point => point.percent), [0, 50, 100]);
  assert.deepEqual(points.map(point => point.label), ['一', '二', '三']);
  assert.equal(points[0].x, 42);
  assert.equal(points[2].x, 622);
  assert.ok(points[2].y < points[1].y && points[1].y < points[0].y);
});
