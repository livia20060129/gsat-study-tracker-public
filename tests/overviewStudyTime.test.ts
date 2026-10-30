import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completedTimeEntriesForOverviewDate,
  recordsWithLiveStudyDraft,
} from '../src/application/overview/overviewStudyTime.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, minutes: string, checkedOn?: string): StudyItem {
  return {
    id,
    type: 'general',
    done: true,
    minutes,
    required: true,
    checkedOn,
    f: { subject: '英文' },
  };
}

function record(date: string, items: StudyItem[]): StudyRecord {
  return { date, items };
}

test('live overview draft replaces the stored record for the same date', () => {
  const stored = [record('2026-09-17', [item('stored', '10')])];
  const live = record('2026-09-17', [item('live', '25')]);

  assert.deepEqual(recordsWithLiveStudyDraft(stored, live), [live]);
});

test('overview includes work checked today from past and future source dates', () => {
  const stored = [
    record('2026-09-16', [item('past', '20', '2026-09-17')]),
    record('2026-09-17', [item('same-day', '10')]),
    record('2026-09-18', [item('future', '40', '2026-09-17')]),
  ];

  const entries = completedTimeEntriesForOverviewDate(stored, null, '2026-09-17');

  assert.equal(entries.reduce(function addMinutes(sum, entry): number {
    return sum + entry.minutes;
  }, 0), 70);
  assert.ok(entries.every(function matchesDate(entry): boolean {
    return entry.date === '2026-09-17';
  }));
});

test('overview excludes completed work attributed to a different check date', () => {
  const stored = [record('2026-09-17', [item('tomorrow', '30', '2026-09-18')])];

  assert.deepEqual(completedTimeEntriesForOverviewDate(stored, null, '2026-09-17'), []);
});
