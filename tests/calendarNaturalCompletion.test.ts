import assert from 'node:assert/strict';
import test from 'node:test';

import {
  markCalendarNaturalCompletionByUser,
  markCalendarNaturalProgressByUser,
  reconcileCalendarNaturalPriorCoverage,
} from '../src/study/calendarNaturalCompletion.ts';
import type { StudyItem } from '../src/types.ts';

function biologyItem(): StudyItem {
  return {
    id: 'biology-today',
    type: 'scienceReview',
    done: false,
    minutes: '',
    required: true,
    source: 'preset',
    presetKey: 'cal_natural_today',
    f: { subject: '生物', material: '123日的淬鍊', start: '10', end: '13' },
  };
}

test('prior biology page coverage automatically checks today complete', () => {
  const item = biologyItem();
  const changed = reconcileCalendarNaturalPriorCoverage(item, true);
  assert.equal(changed, true);
  assert.equal(item.done, true);
  assert.equal(item.f.progress, true);
  assert.equal(item.f.calendarAutoCompletedDone, true);
  assert.equal(item.f.calendarAutoCompletedProgress, true);
});

test('manual cancellation of the biology card stays cancelled after coverage refresh', () => {
  const item = biologyItem();
  reconcileCalendarNaturalPriorCoverage(item, true);
  item.done = false;
  markCalendarNaturalCompletionByUser(item, false);
  reconcileCalendarNaturalPriorCoverage(item, true);
  assert.equal(item.done, false);
  assert.equal(item.f.calendarCompletionUserValue, false);
});

test('manual cancellation of biology progress stays cancelled after coverage refresh', () => {
  const item = biologyItem();
  reconcileCalendarNaturalPriorCoverage(item, true);
  item.f.progress = false;
  markCalendarNaturalProgressByUser(item, false);
  reconcileCalendarNaturalPriorCoverage(item, true);
  assert.equal(item.f.progress, false);
  assert.equal(item.f.calendarProgressUserValue, false);
});

test('automatic completion is cleared if prior coverage no longer applies', () => {
  const item = biologyItem();
  reconcileCalendarNaturalPriorCoverage(item, true);
  reconcileCalendarNaturalPriorCoverage(item, false);
  assert.equal(item.done, false);
  assert.equal(item.f.progress, false);
});
