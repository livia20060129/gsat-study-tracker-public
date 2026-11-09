import type { CalendarTaskRow } from '../../calendar/calendarBridge.ts';
import type { StudyItem, StudyRecord } from '../../types.ts';
import { buildCalendarStudyTaskPlan } from './calendarStudyTaskService.ts';
import { calendarIdentifierToken, calendarScheduleItems } from './calendarScheduleItems.ts';
import { groupDailyWorkItems, ungroupDailyWorkItems } from '../../study/dailyWorkGroup.ts';
import { completedRangeIndex, reconcileRangeCompletion } from '../../study/rangeCompletion.ts';
import { pauseStudyTimer, normalizeStudyTimerState, timerMinutesValue } from '../../study/studyTimer.ts';
import { canonicalPageMappedBook } from '../../data/bookPageMaps.ts';
import { clearUnrecordedCalendarConflict } from '../../study/recordedActivity.ts';

export function isArchivedCalendarItem(item: StudyItem): boolean {
  return item.f?.calendarScheduleArchived === true;
}
const definitionsCache = new WeakMap<CalendarTaskRow[], Map<string, StudyItem[]>>();

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function text(value: unknown): string { return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase(); }
function eventKeys(item: StudyItem): string[] {
  const f = item.f || {};
  return [...new Set([f.calendarEventKey, ...(Array.isArray(f.calendarEventKeys) ? f.calendarEventKeys : [])].filter(Boolean).map(String))];
}

/** Ignore presentation and Google update times; only an actual workload change resets progress. */
export function calendarWorkSignature(item: StudyItem): string {
  const f = item.f || {}, math = item.type === 'mathStudy' || item.type === 'mathLecture';
  let book = f.book;
  if (!math) {
    book = canonicalPageMappedBook(f.title || f.book) || f.title || f.book;
    if (!book && item.type === 'chineseReading') book = '古今悅讀一百';
  }
  const unit = f.unitStart || f.unit, round = f.round;
  let scope = ['pages', f.start, f.end || f.start];
  if (unit) scope = ['unit', unit, f.unitEnd || unit];
  else if (round) scope = ['round', round, f.roundEnd || round];
  const integration = Array.isArray(f.calendarIntegrationEntries) ? f.calendarIntegrationEntries.map(child =>
    [child.subject, child.material, child.ranges]) : [];
  return JSON.stringify([item.type, text(f.subject), text(math || item.type === 'scienceReview' ? f.material : ''), text(book),
    text(f.topic), scope.map(text), integration, !scope[1]
      ? text(f.calendarFixedTemplate || f.calendarUnitProgress || f.calendarPlanTitle || f.calendarTopic || item.title) : '']);
}

function scheduled(item: StudyItem): boolean {
  if (isArchivedCalendarItem(item) || item.source === 'custom') return false;
  return (item.source === 'preset' || item.source === 'groupedWork' || item.calendarGroupedChild === true)
    && (eventKeys(item).length > 0 || /^cal_/.test(item.presetKey || '')
    || Boolean(item.f?.calendarPlanTitle));
}

function flatSources(items: StudyItem[]): StudyItem[] {
  return ungroupDailyWorkItems(items).flatMap(function sources(item): StudyItem[] {
    if (isArchivedCalendarItem(item)) return [item];
    if (item.f?.calendarGroupedWork && Array.isArray(item.f.groupedWorkEntries)) return flatSources(item.f.groupedWorkEntries);
    return [item];
  });
}

function archive(item: StudyItem): StudyItem {
  const saved = clone(item);
  const originalId = item.id;
  saved.id = `calendar-history-${calendarIdentifierToken(originalId + calendarWorkSignature(item))}`;
  function mark(target: StudyItem): void {
    target.f ||= {};
    target.f.calendarScheduleArchived = true;
    target.f.calendarScheduleOriginalId = target.id === saved.id ? originalId : target.id;
    target.f.calendarScheduleOriginalPreset = target.presetKey || '';
    target.source = 'calendar-history';
    target.required = false;
    if (target.f.timeTracking) {
      const timer = normalizeStudyTimerState(target.f.timeTracking);
      target.f.timeTracking = pauseStudyTimer(timer);
      if (timer.mode === 'timer' && timer.startedAt !== null) target.minutes = timerMinutesValue(target.f.timeTracking);
    }
    for (const key of ['groupedWorkEntries', 'dailyWorkSourceItems', 'calendarIntegrationEntries', 'interactiveEntries', 'makeupEntries', 'reviewEntries']) {
      const children = target.f[key];
      if (Array.isArray(children)) children.forEach(child => { if (child?.f) mark(child as StudyItem); });
    }
  }
  mark(saved);
  return saved;
}

function sameEvent(left: StudyItem, right: StudyItem): boolean {
  const keys = new Set(eventKeys(left));
  return eventKeys(right).some(key => keys.has(key))
    || Boolean(left.f?.calendarIdentifier && left.f.calendarIdentifier === right.f?.calendarIdentifier)
    || Boolean(left.type === 'mathStudy' && !keys.size && left.f?.calendarPlanTitle && left.f.calendarPlanTitle === right.f?.calendarPlanTitle);
}

export function calendarItemsByDate(rows: CalendarTaskRow[]): Map<string, StudyItem[]> {
  const cached = definitionsCache.get(rows);
  if (cached) return cached;
  const result = new Map<string, StudyItem[]>();
  for (const task of buildCalendarStudyTaskPlan(rows).tasks) {
    result.set(task.date, [...(result.get(task.date) || []), ...calendarScheduleItems(task)]);
  }
  definitionsCache.set(rows, result);
  return result;
}

/** Fresh successful snapshots alone are authoritative. Failed/offline fetches never call this function. */
export function reconcileCalendarRecord(record: StudyRecord, wanted: readonly StudyItem[], progressSourceItems: StudyItem[] = record.items): StudyRecord | null {
  const originalRecord = record;
  record = clearUnrecordedCalendarConflict(record);
  if (record.syncConflict || record.storageIssue) return null;
  const original = JSON.stringify(record.items);
  const sources = flatSources(clone(record.items || []));
  const progressSources = progressSourceItems === record.items ? sources : flatSources(clone(progressSourceItems));
  const history = progressSources.filter(isArchivedCalendarItem);
  const previous = progressSources.filter(scheduled);
  const ordinary = sources.filter(item => !scheduled(item) && !isArchivedCalendarItem(item));
  const ordinaryIds = new Set(ordinary.map(item => item.id));
  for (const item of progressSources) {
    if (!scheduled(item) && !isArchivedCalendarItem(item) && !ordinaryIds.has(item.id)) ordinary.push(item);
  }
  const used = new Set<StudyItem>();
  const active: StudyItem[] = [];
  for (const template of wanted) {
    const signature = calendarWorkSignature(template);
    const candidates = previous.filter(item => !used.has(item) && sameEvent(item, template));
    const exact = candidates.find(item => String(item.f.calendarScheduleWorkSignature || calendarWorkSignature(item)) === signature);
    const blankMath = template.type === 'mathStudy' ? ordinary.find(item => !used.has(item) && item.source === 'preset'
      && item.type === 'mathStudy' && !item.f?.start && !item.f?.end && !item.done && !Number(item.minutes)) : undefined;
    const old = exact || candidates[0] || blankMath;
    if (old) used.add(old);
    // Pre-migration rows with a missing/broken range still own their recorded minutes.
    const legacyRepair = old && !old.f.calendarScheduleWorkSignature && !old.done;
    const unchanged = Boolean(exact || legacyRepair);
    let next = clone(template);
    if (old && unchanged) {
      next = clone(old);
      next.required = template.required;
      next.description = template.description;
      next.f = { ...next.f, ...clone(template.f) };
      if (Array.isArray(old.f.calendarIntegrationEntries)) next.f.calendarIntegrationEntries = clone(old.f.calendarIntegrationEntries);
      const overrides = old.f.dailyWorkUserFields;
      if (overrides && typeof overrides === 'object') Object.assign(next.f, overrides);
    } else if (old) {
      if (old !== blankMath) history.push(archive(old));
      next.id = old.id;
      next.presetKey = old.presetKey;
      next.templatePresetKey = old.templatePresetKey;
      // Deliberate manual page edits remain editable; they are not evidence that a revised schedule was finished.
      if (old.f.dailyWorkUserFields && typeof old.f.dailyWorkUserFields === 'object') {
        next.f.dailyWorkUserFields = clone(old.f.dailyWorkUserFields);
        Object.assign(next.f, next.f.dailyWorkUserFields);
      }
    }
    if (old && template.type === 'mathStudy' && !template.f.start && !template.f.end) {
      for (const field of ['start', 'end', 'calendarSuggestedStart', 'calendarSuggestedEnd', 'calendarDailyPages']) {
        if (old.f[field] !== undefined) next.f[field] = old.f[field];
      }
    }
    next.source = 'preset';
    next.f.calendarScheduleWorkSignature = signature;
    active.push(next);
  }
  previous.filter(item => !used.has(item)).forEach(item => history.push(archive(item)));
  const archived = [...new Map(history.map(item => [item.id, item])).values()];
  // A removed Calendar-backed built-in must not regenerate as a blank overdue task.
  const suppressed = new Set(archived.map(item => String(item.f.calendarScheduleOriginalPreset || '')).filter(key => !key.startsWith('cal_')));
  const activePresets = new Set(active.map(item => item.presetKey));
  const kept = ordinary.filter(item => !used.has(item)
    && (item.source === 'custom' || !suppressed.has(item.presetKey || '') || activePresets.has(item.presetKey)));
  const next = { ...record, items: [...groupDailyWorkItems([...kept, ...active]), ...archived] };
  if (JSON.stringify(next.items) === original && record === originalRecord) return null;
  return next;
}

export function reconcileCalendarRecords(records: readonly StudyRecord[], rows: CalendarTaskRow[], today: string): StudyRecord[] {
  const definitions = calendarItemsByDate(rows);
  const dates = new Set([...records.map(record => record.date), ...[...definitions.keys()].filter(date => date <= today)]);
  const previous = new Map(records.map(record => [record.date, record]));
  const projected = [...dates].sort().map(date => {
    const record = previous.get(date) || { date, items: [] };
    return reconcileCalendarRecord(record, definitions.get(date) || []) || record;
  });
  const coverage = completedRangeIndex(projected);
  return projected.map(function applyCoveredRanges(record): StudyRecord {
    if (record.syncConflict || record.storageIssue) return record;
    return reconcileRangeCompletion(record, coverage) || record;
  });
}
