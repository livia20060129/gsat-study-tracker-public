import type { StudyTimerState, StudyTimeMode } from '../types.ts';

function wholeNonNegative(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : 0;
}

export function normalizeStudyTimerState(value: unknown): StudyTimerState {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<StudyTimerState>
    : {};
  const mode: StudyTimeMode = source.mode === 'timer' ? 'timer' : 'manual';
  const startedAt = Number(source.startedAt);
  return {
    mode,
    accumulatedSeconds: wholeNonNegative(source.accumulatedSeconds),
    startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : null,
  };
}

export function studyTimerElapsedSeconds(value: unknown, now = Date.now()): number {
  const state = normalizeStudyTimerState(value);
  if (state.startedAt === null) return state.accumulatedSeconds;
  const runningSeconds = Math.max(0, Math.floor((now - state.startedAt) / 1000));
  return state.accumulatedSeconds + runningSeconds;
}

export function startStudyTimer(value: unknown, now = Date.now()): StudyTimerState {
  const state = normalizeStudyTimerState(value);
  return {
    ...state,
    mode: 'timer',
    startedAt: state.startedAt ?? now,
  };
}

export function pauseStudyTimer(value: unknown, now = Date.now()): StudyTimerState {
  const state = normalizeStudyTimerState(value);
  return {
    ...state,
    accumulatedSeconds: studyTimerElapsedSeconds(state, now),
    startedAt: null,
  };
}

export function resetStudyTimer(): StudyTimerState {
  return { mode: 'timer', accumulatedSeconds: 0, startedAt: null };
}

/** Uses the manual minute field as the timer baseline, rounded to the nearest second. */
export function studyTimerFromManualMinutes(value: unknown): StudyTimerState {
  const minutes = Number(value);
  const accumulatedSeconds = Number.isFinite(minutes) && minutes > 0
    ? Math.round(minutes * 60)
    : 0;
  return { mode: 'timer', accumulatedSeconds, startedAt: null };
}

/** Timer display deliberately stays in minutes:seconds, including values above 59 minutes. */
export function formatStudyTimer(value: unknown, now = Date.now()): string {
  const totalSeconds = studyTimerElapsedSeconds(value, now);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function decimalTimerMinutes(seconds: number): string {
  return (Math.round(seconds / 6) / 10).toFixed(1);
}

/** Timed sessions are stored as minutes rounded to one decimal place. */
export function timerMinutesValue(value: unknown, now = Date.now()): string {
  const seconds = studyTimerElapsedSeconds(value, now);
  return seconds > 0 ? decimalTimerMinutes(seconds) : '';
}

/**
 * Finishes an active timed session and returns to the visible manual field.
 * A session that was actually started always writes a one-decimal minute
 * value, even when it rounds to 0.0 minutes.
 */
export function finishStudyTimer(
  value: unknown,
  now = Date.now(),
): { state: StudyTimerState; minutes: string } {
  const source = normalizeStudyTimerState(value);
  const wasStarted = source.startedAt !== null || source.accumulatedSeconds > 0;
  const paused = source.startedAt === null ? source : pauseStudyTimer(source, now);
  return {
    state: { ...paused, mode: 'manual' },
    minutes: wasStarted
      ? decimalTimerMinutes(studyTimerElapsedSeconds(paused, now))
      : '',
  };
}

/** Finds the current entry by stable id before writing its timer result. */
export function setTimedEntryMinutes<T extends { id?: string; minutes?: string }>(
  entries: T[],
  entryId: unknown,
  minutes: string,
): T | null {
  const id = String(entryId ?? '');
  if (!id) return null;
  const entry = entries.find(candidate => String(candidate?.id ?? '') === id) ?? null;
  if (entry) entry.minutes = minutes;
  return entry;
}
