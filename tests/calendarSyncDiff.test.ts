import assert from 'node:assert/strict';
import test from 'node:test';

import { staleCalendarEventKeys } from '../supabase/functions/_shared/calendarSyncDiff.ts';

test('removes stored Calendar rows that disappeared from the latest Google fetch', () => {
  const stale = staleCalendarEventKeys(
    ['primary:kept', 'primary:deleted', 'primary:deleted'],
    ['primary:kept', 'primary:new'],
  );

  assert.deepEqual(stale, ['primary:deleted']);
});

test('keeps every stored Calendar row when the fetched keys still contain it', () => {
  assert.deepEqual(
    staleCalendarEventKeys(['primary:a', 'primary:b'], ['primary:b', 'primary:a']),
    [],
  );
});
