import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyCompletionDateChange,
  completionDateLabel,
  completionDateValue,
  deferredCompletionDate,
  isCompletedByDate,
  manualCompletionDateChange,
} from '../src/study/completionCheckedOn.ts';
import { propagateDailyWorkCompletionDates } from '../src/study/dailyWorkGroup.ts';
import type { StudyItem } from '../src/types.ts';

function item(id = 'task'): StudyItem {
  return { id, type: 'general', done: false, minutes: '', required: true, source: 'preset', f: {} };
}

test('past and future items both record the real check date when checked on another day', () => {
  for (const recordDate of ['2026-09-16', '2026-09-18']) {
    assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate, actionDate: '2026-09-17', deferredCarry: false, confirmedDeferred: false }), {
      checkedOn: '2026-09-17', syncDeferredOrigin: false,
    });
  }
});

test('same-day checks do not add redundant date metadata', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-17', actionDate: '2026-09-17', deferredCarry: false, confirmedDeferred: false }), { syncDeferredOrigin: false });
});

test('checking the original deferred row does not create a late-check date', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-16', actionDate: '2026-09-17', deferredCarry: false, confirmedDeferred: true }), { syncDeferredOrigin: false });
});

test('a deferred carry checked on its target day records and requests source synchronization', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-17', actionDate: '2026-09-17', deferredCarry: true, confirmedDeferred: false }), {
    checkedOn: '2026-09-17', deferredCompletedOn: '2026-09-17', syncDeferredOrigin: true,
  });
});

test('a deferred carry checked before its target still records the actual completion date', () => {
  assert.deepEqual(manualCompletionDateChange({ checked: true, recordDate: '2026-09-18', actionDate: '2026-09-17', deferredCarry: true, confirmedDeferred: false }), {
    checkedOn: '2026-09-17', deferredCompletedOn: '2026-09-17', syncDeferredOrigin: true,
  });
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

test('completion labels use the same wording for normal and deferred completion', () => {
  const normal = item('normal');
  normal.checkedOn = '2026-09-17';
  assert.equal(completionDateLabel(normal), '完成日期：2026-09-17');
  normal.deferredCompletedOn = '2026-09-17';
  assert.equal(completionDateLabel(normal), '完成日期：2026-09-17');
});

test('completed items expose an editable date and same-day completion falls back to the record date', () => {
  const target = item('editable');
  assert.equal(completionDateValue(target, '2026-09-17'), '');
  target.done = true;
  assert.equal(completionDateValue(target, '2026-09-17'), '2026-09-17');
  target.checkedOn = '2026-09-18';
  assert.equal(completionDateValue(target, '2026-09-17'), '2026-09-18');
  delete target.checkedOn;
  target.deferredCompletedOn = '2026-09-19';
  assert.equal(completionDateValue(target, '2026-09-17'), '2026-09-19');
});

test('completion snapshots exclude items checked after the cutoff date', () => {
  const target = item('friday-snapshot');
  target.done = true;
  target.checkedOn = '2026-09-19';
  assert.equal(isCompletedByDate(target, '2026-09-16', '2026-09-18'), false);
  assert.equal(isCompletedByDate(target, '2026-09-16', '2026-09-20'), true);

  delete target.checkedOn;
  assert.equal(isCompletedByDate(target, '2026-09-16', '2026-09-18'), true);
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
