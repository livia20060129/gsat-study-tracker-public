import assert from 'node:assert/strict';
import test from 'node:test';

import {
  countDeferredToDay,
  DEFERRED_TARGET_LIMIT,
  futureDeferredDays,
  hasDeferredTargetCapacity,
  isConfirmedDeferred,
  isDeferrableStudyItem,
  nextDeferredDay,
  requiresDeferredLimitConfirmation,
} from '../src/study/deferDays.ts';

test('延期只列出本週原日期之後的星期', () => {
  assert.deepEqual(futureDeferredDays(1), [2, 3, 4, 5, 6, 0]);
  assert.deepEqual(futureDeferredDays(2), [3, 4, 5, 6, 0]);
  assert.deepEqual(futureDeferredDays(3), [4, 5, 6, 0]);
  assert.deepEqual(futureDeferredDays(4), [5, 6, 0]);
  assert.deepEqual(futureDeferredDays(5), [6, 0]);
  assert.deepEqual(futureDeferredDays(6), [0]);
  assert.deepEqual(futureDeferredDays(0), []);
});

test('預設延期日為下一個可用星期', () => {
  assert.equal(nextDeferredDay(5), 6);
  assert.equal(nextDeferredDay(6), 0);
  assert.equal(nextDeferredDay(0), null);
});

test('無效星期不產生延期選項', () => {
  assert.deepEqual(futureDeferredDays(-1), []);
  assert.deepEqual(futureDeferredDays(7), []);
});

test('每個目標日分別計算一般項目與再次延期的補做項目', () => {
  const fridayItems = Array.from({ length: DEFERRED_TARGET_LIMIT }, () => ({
    source: 'preset',
    required: true,
    deferred: true,
    done: false,
    deferredTargetDay: 5,
  }));
  const saturdayItem = {
    source: 'preset',
    required: true,
    deferred: true,
    done: false,
    deferredTargetDay: 6,
  };
  const ignoredItems = [
    { ...fridayItems[0], source: 'custom' },
    { ...fridayItems[0], done: true },
  ];
  const repeatedDeferredCarry = { ...fridayItems[0], deferredCarry: true };
  const items = [...fridayItems, saturdayItem, repeatedDeferredCarry, ...ignoredItems];

  assert.equal(countDeferredToDay(items, 5), 4);
  assert.equal(countDeferredToDay(items, 6), 1);
  assert.equal(hasDeferredTargetCapacity(items, 5), false);
  assert.equal(hasDeferredTargetCapacity(items, 6), true);
});

test('Calendar 群組子卡、Calendar 補做與延期補做都可各自再次延期', () => {
  assert.equal(isDeferrableStudyItem({ source: 'groupedWork', required: true }), true);
  assert.equal(isDeferrableStudyItem({ source: 'groupedWork', required: false, f: { calendarMakeup: true } }), true);
  assert.equal(isDeferrableStudyItem({ source: 'groupedWork', required: false, deferredCarry: true }), true);
  assert.equal(isDeferrableStudyItem({ source: 'groupedWork', required: false }), false);
});

test('編輯既有延期項目時不把自己重複計入上限', () => {
  const selectedItem = {
    source: 'preset',
    required: true,
    deferred: true,
    done: false,
    deferredTargetDay: 5,
  };
  const items = [selectedItem, { ...selectedItem }, { ...selectedItem }];

  assert.equal(countDeferredToDay(items, 5, selectedItem), 2);
  assert.equal(hasDeferredTargetCapacity(items, 5, selectedItem), true);
});

test('只有選定目標日並確認後才視為正式延期', () => {
  assert.equal(isConfirmedDeferred({ deferred: false, deferredTargetDay: 5 }), false);
  assert.equal(isConfirmedDeferred({ deferred: true }), false);
  assert.equal(isConfirmedDeferred({ deferred: true, deferredTargetDay: 1 }), false);
  assert.equal(isConfirmedDeferred({ deferred: true, deferredTargetDay: 5 }), true);
  assert.equal(isConfirmedDeferred({ deferred: true, deferredTargetDay: 0 }), true);
});

test('既有超額延期會保留並回報實際數量', () => {
  const deferredItems = Array.from({ length: 4 }, () => ({
    source: 'preset',
    required: true,
    deferred: true,
    done: false,
    deferredTargetDay: 5,
  }));

  assert.equal(countDeferredToDay(deferredItems, 5), 4);
  assert.equal(hasDeferredTargetCapacity(deferredItems, 5), false);
});

test('目標日額滿或超額時要求額外確認', () => {
  assert.equal(requiresDeferredLimitConfirmation(2), false);
  assert.equal(requiresDeferredLimitConfirmation(3), true);
  assert.equal(requiresDeferredLimitConfirmation(4), true);
});

test('已確認延期改選日期時重新計算新目標日容量', () => {
  const movingItem = {
    source: 'preset',
    required: true,
    deferred: true,
    done: false,
    deferredTargetDay: 5,
  };
  const saturdayItems = Array.from({ length: DEFERRED_TARGET_LIMIT }, () => ({
    ...movingItem,
    deferredTargetDay: 6,
  }));
  const items = [movingItem, ...saturdayItems];
  const targetCount = countDeferredToDay(items, 6, movingItem);

  assert.equal(targetCount, 3);
  assert.equal(requiresDeferredLimitConfirmation(targetCount), true);
});

test('合併卡片中的延期子項目會分別計入目標日容量', () => {
  const children = Array.from({ length: 3 }, (_, index) => ({
    id: `child-${index}`,
    source: 'preset',
    required: true,
    deferred: true,
    done: false,
    deferredTargetDay: 5,
  }));
  const parent = {
    id: 'parent',
    f: { dailyWorkSourceItems: children },
  };
  assert.equal(countDeferredToDay([parent], 5), 3);
  assert.equal(countDeferredToDay([parent], 5, {
    id: 'child-view',
    f: { dailyWorkSourceItems: [children[0]] },
  }), 2);
});
