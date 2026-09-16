import assert from 'node:assert/strict';
import test from 'node:test';

import {
  formatPercentagePointDelta,
  makeupCompletionUnit,
  originalCompletionUnit,
  groupedMakeupCompletionUnits,
  groupedOriginalCompletionUnits,
  summarizeCompletionUnits,
} from '../src/study/completionMetrics.ts';

test('confirmed deferral reduces both denominators without increasing completed counts', () => {
  const metrics = summarizeCompletionUnits([
    originalCompletionUnit(true),
    originalCompletionUnit(false),
    originalCompletionUnit(false, true),
  ]);

  assert.equal(metrics.itemCompleted, 1);
  assert.equal(metrics.itemTotal, 2);
  assert.equal(metrics.itemPercent, 50);
  assert.equal(metrics.workloadCompleted, 1);
  assert.equal(metrics.workloadTotal, 2);
  assert.equal(metrics.workloadPercent, 50);
  assert.equal(metrics.settlementPercent, 50);
});

test('calculates workload from item counts rather than time weights', () => {
  const metrics = summarizeCompletionUnits([
    { itemAccepted: true, workloadCompleted: true },
    { itemAccepted: false, workloadCompleted: false },
    { itemAccepted: false, workloadCompleted: false },
  ]);

  assert.equal(metrics.itemPercent, 33);
  assert.equal(metrics.workloadCompleted, 1);
  assert.equal(metrics.workloadTotal, 3);
  assert.equal(metrics.workloadPercent, 33);
  assert.equal(metrics.settlementPercent, 33);
});

test('formats Friday comparison as signed percentage points', () => {
  assert.equal(formatPercentagePointDelta(8), '+8%');
  assert.equal(formatPercentagePointDelta(-8), '-8%');
  assert.equal(formatPercentagePointDelta(0), '±0%');
});

test('adds today makeup work to workload without changing original item totals', () => {
  const metrics = summarizeCompletionUnits([
    { itemAccepted: true, workloadCompleted: true },
    makeupCompletionUnit(false),
  ]);

  assert.equal(metrics.itemCompleted, 1);
  assert.equal(metrics.itemTotal, 1);
  assert.equal(metrics.itemPercent, 100);
  assert.equal(metrics.workloadCompleted, 1);
  assert.equal(metrics.workloadTotal, 2);
  assert.equal(metrics.workloadPercent, 50);
});

test('includes completed deferred makeup in weekly workload without duplicating the original item', () => {
  const metrics = summarizeCompletionUnits([
    originalCompletionUnit(true),
    originalCompletionUnit(false, true),
    makeupCompletionUnit(true),
  ]);

  assert.equal(metrics.itemCompleted, 1);
  assert.equal(metrics.itemTotal, 1);
  assert.equal(metrics.itemPercent, 100);
  assert.equal(metrics.workloadCompleted, 2);
  assert.equal(metrics.workloadTotal, 2);
  assert.equal(metrics.workloadPercent, 100);
  assert.equal(metrics.settlementPercent, 100);
});

test('can count detailed original items as one top-level workload item', () => {
  const metrics = summarizeCompletionUnits([
    { workloadIncluded: false, itemAccepted: true, workloadCompleted: true },
    { workloadIncluded: false, itemAccepted: false, workloadCompleted: false },
    { itemIncluded: false, itemAccepted: false, workloadCompleted: false },
  ]);

  assert.equal(metrics.itemTotal, 2);
  assert.equal(metrics.workloadTotal, 1);
});

test('counts every grouped range or round child as a separate original item', () => {
  const metrics = summarizeCompletionUnits(groupedOriginalCompletionUnits([true, false, true]));
  assert.equal(metrics.itemTotal, 3);
  assert.equal(metrics.itemCompleted, 2);
  assert.equal(metrics.workloadTotal, 3);
  assert.equal(metrics.workloadCompleted, 2);
});

test('an independently deferred original child is excluded without changing its siblings', () => {
  const metrics = summarizeCompletionUnits([
    ...groupedOriginalCompletionUnits([false], true),
    ...groupedOriginalCompletionUnits([false], false),
  ]);
  assert.equal(metrics.itemTotal, 1);
  assert.equal(metrics.itemCompleted, 0);
  assert.equal(metrics.workloadTotal, 1);
  assert.equal(metrics.workloadCompleted, 0);
});

test('counts grouped deferred children only in actual workload', () => {
  const metrics = summarizeCompletionUnits(groupedMakeupCompletionUnits([true, false]));
  assert.equal(metrics.itemTotal, 0);
  assert.equal(metrics.workloadTotal, 2);
  assert.equal(metrics.workloadCompleted, 1);
});

test('repeated makeup deferrals count only the final target day in weekly workload', () => {
  const metrics = summarizeCompletionUnits([
    originalCompletionUnit(false, true),
    makeupCompletionUnit(false, true),
    ...groupedMakeupCompletionUnits([false], true),
    makeupCompletionUnit(true),
  ]);
  assert.equal(metrics.itemCompleted, 0);
  assert.equal(metrics.itemTotal, 0);
  assert.equal(metrics.workloadCompleted, 1);
  assert.equal(metrics.workloadTotal, 1);
  assert.equal(metrics.workloadPercent, 100);
});

test('zero eligible items show zero percent even if a deferred record retains an old done flag', () => {
  const metrics = summarizeCompletionUnits([
    originalCompletionUnit(true, true),
    makeupCompletionUnit(true, true),
  ]);
  assert.equal(metrics.itemCompleted, 0);
  assert.equal(metrics.itemTotal, 0);
  assert.equal(metrics.workloadCompleted, 0);
  assert.equal(metrics.workloadTotal, 0);
  assert.equal(metrics.itemPercent, 0);
  assert.equal(metrics.workloadPercent, 0);
  assert.equal(metrics.settlementPercent, 0);
});
