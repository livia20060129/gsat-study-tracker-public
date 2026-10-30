import type { StudyItem, StudyRecord, StudyTimerState, StudyTimeMode } from '../../types.ts';
import { completionChildItems, findCompletionItem } from '../../study/completionTree.ts';
import { propagateDailyWorkField, relinkDailyWorkSourceItems, replaceDailyWorkMinutes } from '../../study/dailyWorkGroup.ts';
import {
  finishStudyTimer, normalizeStudyTimerState, pauseStudyTimer, resetStudyTimer,
  startStudyTimer, studyTimerFromManualMinutes, timerMinutesValue,
} from '../../study/studyTimer.ts';

export interface StudyTimerPointer {
  date: string;
  itemId: string;
  entryId?: string;
}

interface MagazineTimerEntry {
  id?: string;
  minutes?: string;
  timeTracking?: StudyTimerState;
}

export interface StudyTimerTarget {
  record: StudyRecord;
  item: StudyItem;
  entry: MagazineTimerEntry | null;
  pointer: StudyTimerPointer;
}

export interface StudyTimerChange {
  state: StudyTimerState;
  minutes?: string;
}

export function sameStudyTimerPointer(a: StudyTimerPointer | null, b: StudyTimerPointer | null): boolean {
  return Boolean(a && b && a.date === b.date && a.itemId === b.itemId
    && (a.entryId || '') === (b.entryId || ''));
}

/** Both pages resolve the persisted source IDs, including hidden merged rows. */
export function resolveStudyTimerTarget(record: StudyRecord | null, pointer: StudyTimerPointer): StudyTimerTarget | null {
  if (!record || record.date !== pointer.date) return null;
  relinkDailyWorkSourceItems(record.items);
  const item = findCompletionItem(record.items, pointer.itemId)
    ?? record.items.flatMap(root => root.f.reviewEntries ?? []).find(row => row.id === pointer.itemId);
  if (!item) return null;
  let entry: MagazineTimerEntry | null = null;
  if (pointer.entryId) {
    const entries = Array.isArray(item.f.entries) ? item.f.entries as MagazineTimerEntry[] : [];
    entry = entries.find(candidate => candidate?.id === pointer.entryId) ?? null;
    if (!entry) return null;
  }
  return { record, item, entry, pointer };
}

export function studyTimerTargetState(target: StudyTimerTarget): StudyTimerState {
  return normalizeStudyTimerState(target.entry ? target.entry.timeTracking : target.item.f.timeTracking);
}

function timerOwner(item: StudyItem): StudyItem {
  const visited = new Set<StudyItem>();
  let owner = item;
  while (!visited.has(owner)) {
    visited.add(owner);
    const sources = owner.f.dailyWorkSourceItems;
    const preferred = sources?.find(source => source.required && !source.deferredCarry)
      ?? sources?.find(source => !source.deferredCarry) ?? sources?.[0];
    if (!preferred) break;
    owner = preferred;
  }
  return owner;
}

export function sameStudyTimerTarget(record: StudyRecord, a: StudyTimerPointer, b: StudyTimerPointer): boolean {
  if (sameStudyTimerPointer(a, b)) return true;
  if (a.date !== b.date || (a.entryId || '') !== (b.entryId || '')) return false;
  const first = resolveStudyTimerTarget(record, a);
  const second = resolveStudyTimerTarget(record, b);
  return Boolean(first && second && timerOwner(first.item).id === timerOwner(second.item).id);
}

/** Mirrors the preferred source whose timer is displayed by an aggregate card. */
function mirrorTimerSource(target: StudyTimerTarget): void {
  const visited = new Set<StudyItem>();
  function visit(item: StudyItem): void {
    if (visited.has(item)) return;
    visited.add(item);
    const sources = item.f.dailyWorkSourceItems;
    const preferredSource = sources?.find(source => source.required && !source.deferredCarry)
      ?? sources?.find(source => !source.deferredCarry) ?? sources?.[0];
    if (preferredSource === target.item && item !== target.item && !item.f.groupedWorkEntries?.length) {
      if (target.entry) item.f.entries = target.item.f.entries;
      else {
        item.f.timeTracking = target.item.f.timeTracking;
        item.minutes = target.item.minutes;
      }
    }
    completionChildItems(item, true).forEach(visit);
  }
  target.record.items.forEach(visit);
}

export function setStudyTimerTargetState(target: StudyTimerTarget, state: StudyTimerState): StudyTimerState {
  const normalized = normalizeStudyTimerState(state);
  if (target.entry) {
    target.entry.timeTracking = normalized;
    propagateDailyWorkField(target.item, 'entries', target.item.f.entries);
    target.entry = (target.item.f.entries as MagazineTimerEntry[]).find(entry => entry.id === target.pointer.entryId) ?? null;
  } else propagateDailyWorkField(target.item, 'timeTracking', normalized);
  mirrorTimerSource(target);
  return normalized;
}

export function setStudyTimerTargetMinutes(target: StudyTimerTarget, minutes: string): void {
  if (target.entry) {
    target.entry.minutes = minutes;
    propagateDailyWorkField(target.item, 'entries', target.item.f.entries);
    target.entry = (target.item.f.entries as MagazineTimerEntry[]).find(entry => entry.id === target.pointer.entryId) ?? null;
  } else replaceDailyWorkMinutes(target.item, minutes);
  mirrorTimerSource(target);
}

export function switchStudyTimerMode(
  value: unknown, mode: StudyTimeMode, manualMinutes: string, now = Date.now(),
): StudyTimerChange {
  const state = normalizeStudyTimerState(value);
  if (state.mode === mode) return { state };
  if (mode === 'manual') return finishStudyTimer(state, now);
  const roundedMinutes = timerMinutesValue(state, now);
  if (state.accumulatedSeconds > 0 && manualMinutes !== '' && Number(manualMinutes) === Number(roundedMinutes)) {
    return { state: { ...state, mode: 'timer', startedAt: null } };
  }
  return { state: studyTimerFromManualMinutes(manualMinutes) };
}

export function changeStudyTimer(value: unknown, command: string, now = Date.now()): StudyTimerChange | null {
  const state = normalizeStudyTimerState(value);
  if (command === 'toggle') {
    return { state: state.startedAt === null ? startStudyTimer(state, now) : pauseStudyTimer(state, now) };
  }
  if (command === 'finish') return finishStudyTimer(state, now);
  if (command === 'reset') return { state: resetStudyTimer(), minutes: '' };
  return null;
}

export function studyTimerToggleLabel(state: StudyTimerState): string {
  if (state.startedAt !== null) return '暫停';
  return state.accumulatedSeconds > 0 ? '繼續' : '開始';
}
