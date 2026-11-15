import assert from 'node:assert/strict';
import test from 'node:test';
import { isNewEmptyRecord } from '../src/study/recordedActivity.ts';
import type { StudyRecord } from '../src/types.ts';

function empty(): StudyRecord { return { date: '2026-11-15', notes: '', wakeTime: '', mood: '', biggestBlock: '', firstThingTomorrow: '', items: [], serverRevision: 0, syncConflict: false }; }

test('opening a fresh public day with only generated display metadata is not a cloud edit', () => {
  const record = { ...empty(), completionCelebrations: { version: 3, half: false, complete: false } };
  assert.equal(isNewEmptyRecord(record), true);
});

test('new user input or a manual card still requires synchronization', () => {
  for (const record of [{ ...empty(), notes: 'actual input' }, { ...empty(), wakeTime: '07:00' },
    { ...empty(), items: [{ id: 'manual', type: 'general', source: 'custom', done: false, minutes: '', required: false, f: {} }] } as StudyRecord]) {
    assert.equal(isNewEmptyRecord(record), false);
  }
});

test('existing empty or deliberately cleared records must never be silently marked as a new view', () => {
  const prior = empty();
  assert.equal(isNewEmptyRecord(empty(), prior), false);
  assert.equal(isNewEmptyRecord({ ...empty(), serverRevision: 2 }), false);
  assert.equal(isNewEmptyRecord({ ...empty(), syncBase: { ...empty(), notes: 'explicitly cleared previous input' } }), false);
});

test('conflicted or damaged records stay under their existing recovery rules', () => {
  assert.equal(isNewEmptyRecord({ ...empty(), syncConflict: true }), false);
  assert.equal(isNewEmptyRecord({ ...empty(), storageIssue: { date: '2026-11-15' } } as StudyRecord), false);
});
