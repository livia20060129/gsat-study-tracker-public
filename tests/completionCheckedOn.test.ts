import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCompletionDateChange,
  completionDateLabel,
  deferredCompletionDate,
  manualCompletionDateChange,
} from '../src/study/completionCheckedOn.ts';
import { propagateDailyWorkCompletionDates } from '../src/study/dailyWorkGroup.ts';
import type { StudyItem } from '../src/types.ts';

function item(id = 'task'): StudyItem {
  return { id, type: 'general', done: false, minutes: '', required: true, source: 'preset', f: {} };
}

test('a late manual check records the real check date', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-16', actionDate: '2026-09-17', deferredCarry: false, confirmedDeferred: false }), {
    checkedOn: '2026-09-17', syncDeferredOrigin: false,
  });
});

test('same-day and early checks do not record a check date', () => {
  for (const recordDate of ['2026-09-17', '2026-09-18']) {
    assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate, actionDate: '2026-09-17', deferredCarry: false, confirmedDeferred: false }), { syncDeferredOrigin: false });
  }
});

test('checking the original deferred row does not create a late-check date', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-16', actionDate: '2026-09-17', deferredCarry: false, confirmedDeferred: true }), { syncDeferredOrigin: false });
});

test('a deferred carry checked on its target day records and requests source synchronization', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-17', actionDate: '2026-09-17', deferredCarry: true, confirmedDeferred: false }), {
    checkedOn: '2026-09-17', deferredCompletedOn: '2026-09-17', syncDeferredOrigin: true,
  });
});

test('a future deferred carry cannot complete its original record early', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-18', actionDate: '2026-09-17', deferredCarry: true, confirmedDeferred: false }), { syncDeferredOrigin: false });
});

test('unchecking clears completion dates and reverses a previously synchronized deferral', () => {
  const change = manualCompletionDateChange({ checked: false, recordDate: '2026-09-17', actionDate: '2026-09-17', deferredCarry: true, confirmedDeferred: false, previousDeferredCompletedOn: '2026-09-17' });
  const target = item();
  target.checkedOn = '2026-09-17';
  target.deferredCompletedOn = '2026-09-17';
  applyCompletionDateChange(target, change);
  assert.equal(target.checkedOn, undefined);
  assert.equal(target.deferredCompletedOn, undefined);
  assert.equal(change.syncDeferredOrigin, true);
});

test('completion labels distinguish a normal late check from deferred completion', () => {
  const normal = item('normal');
  normal.checkedOn = '2026-09-17';
  assert.equal(completionDateLabel(normal), '2026-09-17 勾選');
  normal.deferredCompletedOn = '2026-09-17';
  assert.equal(completionDateLabel(normal), '延期完成：2026-09-17');
});

test('hidden grouped sources retain completion-date metadata', () => {
  const source = item('source');
  const child = item('child');
  child.f.dailyWorkSourceItems = [source];
  const parent = item('parent');
  parent.f.groupedWorkEntries = [child];
  propagateDailyWorkCompletionDates(parent, '2026-09-17', '2026-09-17');
  assert.equal(source.checkedOn, '2026-09-17');
  assert.equal(deferredCompletionDate(parent), '2026-09-17');
  propagateDailyWorkCompletionDates(parent, undefined, undefined);
  assert.equal(source.checkedOn, undefined);
  assert.equal(deferredCompletionDate(parent), undefined);
});
