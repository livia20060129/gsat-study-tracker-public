import type { StudyItem, StudyRecord } from '../types.ts';
import { magazineMonthForDate } from './magazineDefaults.ts';

const inputFields = [
  'progress', 'graded', 'corrected', 'review', 'reason', 'result', 'score', 'status',
  'priorityFix', 'essayScore', 'mixedScore', 'correctCount', 'translationScore1',
  'translationScore2', 'errorConceptGrammar', 'improvement', 'extended',
  'listening', 'vocab', 'translation', 'gsatPart1', 'overdueSkippedOn', 'overdueTodoAction',
];
const childrenFields = [
  'dailyWorkSourceItems', 'groupedWorkEntries', 'calendarIntegrationEntries',
  'interactiveEntries', 'makeupEntries', 'reviewEntries',
];
const ignoredRecordFields = new Set([
  'date', 'schemaVersion', 'items', 'updatedAt', 'serverRevision', 'serverUpdatedAt',
  'localDirty', 'syncConflict', 'syncBase', 'syncConflictDetails', 'syncConflictLocal',
  'syncConflictCloud', 'storageIssue', '__localSyncBase', 'completionCelebrations',
]);

function filled(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(filled);
  if (value && typeof value === 'object') return Object.values(value).some(filled);
  return value === true || (typeof value === 'number' && Number.isFinite(value));
}

function calendarItem(item: StudyItem): boolean {
  const f = item.f || {};
  return Boolean(f.calendarEventKey || f.calendarEventId || f.calendarEventKeys
    || f.calendarPlanTitle || f.calendarScheduleArchived || /^cal_/.test(item.presetKey || ''));
}

function nestedItems(item: StudyItem): StudyItem[] {
  return childrenFields.flatMap(function children(key): StudyItem[] {
    const value = item.f?.[key];
    return Array.isArray(value) ? value as StudyItem[] : [];
  });
}

/** The initial magazine row has a generated ID, selected-date month and idle timer. */
function hasEntryInput(item: StudyItem, date: string): boolean {
  const entries = item.f?.entries;
  if (item.type !== 'magazine' || !Array.isArray(entries)) return filled(entries);
  // Adding another row is a deliberate edit, even before its fields are filled.
  if (entries.length > 1) return true;
  return entries.some(entry => {
    if (!entry || typeof entry !== 'object') return filled(entry);
    if (entry.magazineMonthInitialized !== true || String(entry.month ?? '') !== magazineMonthForDate(date)) return filled(entry);
    return Object.entries(entry).some(([key, value]) => {
      if (['id', 'month', 'magazineMonthInitialized'].includes(key)) return false;
      if (key === 'timeTracking') {
        const timer = value as { accumulatedSeconds?: number; startedAt?: number | null } | null;
        return Boolean(timer && (Number(timer.accumulatedSeconds) > 0 || timer.startedAt != null));
      }
      return filled(value);
    });
  });
}

export function hasCalendarSchedule(record: StudyRecord): boolean {
  function contains(item: StudyItem): boolean {
    return calendarItem(item) || nestedItems(item).some(contains);
  }
  return (record.items || []).some(contains);
}

/** Generated ranges, titles, sync flags and display animations are not user records. */
export function hasRecordedStudyInput(record: StudyRecord): boolean {
  if (Object.entries(record).some(([key, value]) => !ignoredRecordFields.has(key) && filled(value))) return true;
  function entered(item: StudyItem, inheritedSchedule = false): boolean {
    if (item.source === 'custom') return true;
    if (item.done || filled(item.minutes) || filled(item.checkedOn) || filled(item.deferredCompletedOn)
      || item.deferred || item.deferredCarry) return true;
    const f = item.f || {};
    if (inputFields.some(key => filled(f[key])) || filled(f.words) || hasEntryInput(item, record.date)) return true;
    // A deliberately cleared manual boundary still protects the user's choice.
    if (f.dailyWorkUserFields && Object.keys(f.dailyWorkUserFields).length) return true;
    if (f.timeTracking && (Number(f.timeTracking.accumulatedSeconds) > 0 || f.timeTracking.startedAt != null)) return true;
    const scheduled = inheritedSchedule || item.source === 'preset' || calendarItem(item);
    if (!scheduled && item.source !== 'groupedWork' && item.source !== 'calendar-history') return true;
    return nestedItems(item).some(child => entered(child, scheduled));
  }
  return (record.items || []).some(item => entered(item));
}

/** Include cleared input from a common base and both recoverable conflict versions. */
export function hasProtectedStudyInput(record: StudyRecord): boolean {
  return [record, record.syncBase, record.syncConflictLocal, record.syncConflictCloud].some(value => value && hasRecordedStudyInput(value));
}

/** Calendar rows are already cloud data; untouched projections are a local cache, not an upload. */
export function isUnrecordedCalendarCache(record: StudyRecord, previous?: StudyRecord | null): boolean {
  return Boolean(!record.storageIssue && !previous?.storageIssue
    && (hasCalendarSchedule(record) || (previous && hasCalendarSchedule(previous)))
    && !hasProtectedStudyInput(record) && (!previous || !hasProtectedStudyInput(previous)));
}

/** A complete successful Calendar snapshot can resolve an empty schedule-only conflict. */
export function clearUnrecordedCalendarConflict(record: StudyRecord): StudyRecord {
  if (!record.syncConflict || record.storageIssue || !hasCalendarSchedule(record)
    || hasProtectedStudyInput(record)) return record;
  const next = { ...record, syncConflict: false };
  delete next.syncConflictDetails;
  delete next.syncConflictLocal;
  delete next.syncConflictCloud;
  return next;
}
