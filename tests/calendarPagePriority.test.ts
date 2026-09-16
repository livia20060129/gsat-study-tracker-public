import assert from 'node:assert/strict';
import test from 'node:test';

import { prioritizeCalendarPageRanges } from '../src/calendar/pagePriority.ts';

test('uses explicit Calendar pages before unit-derived pages for every page-based subject', () => {
  for (const subject of ['數學', '物理', '化學', '生物', '地科', '英文文法']) {
    const selected = prioritizeCalendarPageRanges(80, 88, [[76, 97]]);
    assert.deepEqual(selected, { ranges: [[80, 88]], source: 'calendar' }, subject);
  }
});

test('falls back to unit-derived pages only when Calendar has no valid range', () => {
  assert.deepEqual(
    prioritizeCalendarPageRanges(null, null, [[76, 97]]),
    { ranges: [[76, 97]], source: 'unit' },
  );
});
