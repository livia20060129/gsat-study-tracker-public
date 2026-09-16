import assert from 'node:assert/strict';
import test from 'node:test';

import { initializeMagazineMonth, magazineMonthForDate } from '../src/study/magazineDefaults.ts';

test('uses the Tracker study date month as the magazine default', () => {
  const entry: Record<string, unknown> = {};
  assert.equal(initializeMagazineMonth(entry, '2026-09-03'), true);
  assert.equal(entry.month, '9');
  assert.equal(entry.magazineMonthInitialized, true);
});

test('preserves an edited magazine month', () => {
  const entry: Record<string, unknown> = { month: '8', magazineMonthInitialized: true };
  assert.equal(initializeMagazineMonth(entry, '2026-09-03'), false);
  assert.equal(entry.month, '8');
});

test('preserves a manually cleared month after initialization', () => {
  const entry: Record<string, unknown> = { month: '', magazineMonthInitialized: true };
  assert.equal(initializeMagazineMonth(entry, '2026-09-03'), false);
  assert.equal(entry.month, '');
});

test('rejects invalid study dates instead of inventing a month', () => {
  assert.equal(magazineMonthForDate('not-a-date'), '');
  assert.equal(magazineMonthForDate('2026-13-03'), '');
});
