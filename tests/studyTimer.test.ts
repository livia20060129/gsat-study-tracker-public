import assert from 'node:assert/strict';
import test from 'node:test';

import {
  finishStudyTimer,
  formatStudyTimer,
  normalizeStudyTimerState,
  pauseStudyTimer,
  resetStudyTimer,
  setTimedEntryMinutes,
  startStudyTimer,
  studyTimerElapsedSeconds,
  studyTimerFromManualMinutes,
  timerMinutesValue,
} from '../src/study/studyTimer.ts';

test('normalizes missing or malformed timer state to manual mode', () => {
  assert.deepEqual(normalizeStudyTimerState(null), {
    mode: 'manual',
    accumulatedSeconds: 0,
    startedAt: null,
  });
  assert.deepEqual(normalizeStudyTimerState({ mode: 'timer', accumulatedSeconds: -5, startedAt: 'bad' }), {
    mode: 'timer',
    accumulatedSeconds: 0,
    startedAt: null,
  });
});

test('starts, pauses, and resumes by timestamp instead of relying on interval ticks', () => {
  const started = startStudyTimer(resetStudyTimer(), 1_000);
  assert.equal(studyTimerElapsedSeconds(started, 66_900), 65);
  const paused = pauseStudyTimer(started, 66_900);
  assert.deepEqual(paused, { mode: 'timer', accumulatedSeconds: 65, startedAt: null });
  const resumed = startStudyTimer(paused, 100_000);
  assert.equal(studyTimerElapsedSeconds(resumed, 105_000), 70);
});

test('switching from manual time seeds the timer at the nearest second', () => {
  assert.deepEqual(studyTimerFromManualMinutes('12.5'), {
    mode: 'timer', accumulatedSeconds: 750, startedAt: null,
  });
  assert.equal(formatStudyTimer(studyTimerFromManualMinutes('1.234')), '01:14');
  assert.equal(formatStudyTimer(studyTimerFromManualMinutes('')), '00:00');
  assert.equal(formatStudyTimer(studyTimerFromManualMinutes('-3')), '00:00');
});

test('formats elapsed time only as minutes and seconds even past one hour', () => {
  assert.equal(formatStudyTimer({ mode: 'timer', accumulatedSeconds: 5, startedAt: null }), '00:05');
  assert.equal(formatStudyTimer({ mode: 'timer', accumulatedSeconds: 59, startedAt: null }), '00:59');
  assert.equal(formatStudyTimer({ mode: 'timer', accumulatedSeconds: 60, startedAt: null }), '01:00');
  assert.equal(formatStudyTimer({ mode: 'timer', accumulatedSeconds: 3_920, startedAt: null }), '65:20');
});

test('never renders 60 in the seconds position', () => {
  for (let elapsed = 0; elapsed <= 10_000; elapsed += 1) {
    const display = formatStudyTimer({ mode: 'timer', accumulatedSeconds: elapsed, startedAt: null });
    const seconds = Number(display.split(':')[1]);
    assert.ok(seconds >= 0 && seconds <= 59, `${display} has an invalid seconds value`);
  }
});

test('converts a completed timer to minutes rounded to one decimal place', () => {
  assert.equal(timerMinutesValue({ mode: 'timer', accumulatedSeconds: 0, startedAt: null }), '');
  assert.equal(timerMinutesValue({ mode: 'timer', accumulatedSeconds: 2, startedAt: null }), '0.0');
  assert.equal(timerMinutesValue({ mode: 'timer', accumulatedSeconds: 3, startedAt: null }), '0.1');
  assert.equal(timerMinutesValue({ mode: 'timer', accumulatedSeconds: 15, startedAt: null }), '0.3');
  assert.equal(timerMinutesValue({ mode: 'timer', accumulatedSeconds: 89, startedAt: null }), '1.5');
  assert.equal(timerMinutesValue({ mode: 'timer', accumulatedSeconds: 90, startedAt: null }), '1.5');
  assert.equal(timerMinutesValue({ mode: 'timer', accumulatedSeconds: 93, startedAt: null }), '1.6');
});

test('finish fills the manual field and makes even a very short active session visible', () => {
  const completed = finishStudyTimer({ mode: 'timer', accumulatedSeconds: 0, startedAt: 1_000 }, 1_200);
  assert.deepEqual(completed, {
    state: { mode: 'manual', accumulatedSeconds: 0, startedAt: null },
    minutes: '0.0',
  });
});

test('finish rounds a longer timer and does not invent time before a session starts', () => {
  assert.deepEqual(
    finishStudyTimer({ mode: 'timer', accumulatedSeconds: 90, startedAt: null }),
    { state: { mode: 'manual', accumulatedSeconds: 90, startedAt: null }, minutes: '1.5' },
  );
  assert.deepEqual(
    finishStudyTimer({ mode: 'timer', accumulatedSeconds: 0, startedAt: null }),
    { state: { mode: 'manual', accumulatedSeconds: 0, startedAt: null }, minutes: '' },
  );
});

test('writes completed minutes to the current magazine entry instead of a stale clone', () => {
  const staleEntry = { id: 'mag-1', minutes: '', timeTracking: { mode: 'timer' } };
  const currentEntries = JSON.parse(JSON.stringify([staleEntry]));

  const currentEntry = setTimedEntryMinutes(currentEntries, staleEntry.id, '12.5');

  assert.equal(currentEntry, currentEntries[0]);
  assert.equal(currentEntries[0].minutes, '12.5');
  assert.equal(staleEntry.minutes, '');
});

test('does not write to a different magazine entry when the id is missing', () => {
  const entries = [{ id: 'mag-1', minutes: '8' }];
  assert.equal(setTimedEntryMinutes(entries, 'mag-missing', '20'), null);
  assert.equal(entries[0].minutes, '8');
});
