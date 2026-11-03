import type { CompletionMetrics, CompletionUnit } from './completionMetrics.ts';
import {
  groupedMakeupCompletionUnits,
  groupedOriginalCompletionUnits,
  makeupCompletionUnit,
  originalCompletionUnit,
  summarizeCompletionUnits,
} from './completionMetrics.ts';
import { isConfirmedDeferred } from './deferDays.ts';
import { activeEnglishTaskItems } from './englishTaskChoice.ts';
import { isInteractiveStudyItem } from './interactiveTasks.ts';
import { effectiveTemplatePresetKey, specialItemTemplate } from './makeup.ts';
import { summarizeSubjectTime, type SubjectTimeSummary } from './subjectTime.ts';
import {
  completedStudyTimeEntries,
  type CompletedStudyTimeEntry,
} from './completedStudyTime.ts';
import type { StudyItem, StudyRecord } from '../types.ts';

export {
  completedStudyTimeEntries,
  completedSubjectTimeForRecord,
  groupedSummarySubjectTime,
  NATURAL_SCIENCE_SUBJECTS,
  summarizeNaturalScienceTime,
  summarizeStudyItemTime,
} from './completedStudyTime.ts';
export type {
  CompletedStudyTimeEntry,
  NaturalScienceItemTimeSlice,
  StudyItemTimeSlice,
} from './completedStudyTime.ts';

export const SUMMARY_MODES = ['week', 'month'] as const;
export type SummaryMode = typeof SUMMARY_MODES[number];

const DAY_MS = 86_400_000;

export interface SummaryPeriod {
  mode: SummaryMode;
  anchor: string;
  start: string;
  end: string;
  label: string;
  dates: string[];
}

export interface LearningSummaryDay {
  date: string;
  dayNumber: number;
  weekday: string;
  hasRecord: boolean;
  mood: string;
  totalMinutes: number;
  makeupMinutes: number;
  completionPercent: number;
  completionIncludedInPeriod: boolean;
}

export interface LearningPeriodSummary {
  period: SummaryPeriod;
  days: LearningSummaryDay[];
  records: StudyRecord[];
  completion: CompletionMetrics;
  subjectTime: SubjectTimeSummary;
  timeEntries: CompletedStudyTimeEntry[];
  recordedDayCount: number;
}

export interface LearningPeriodOptions {
  includeStatusDaysInCompletion?: boolean;
}

export type PeriodChangeState = 'increase' | 'stable' | 'decrease';

export interface FixedPeriodRemarks {
  timeState: PeriodChangeState;
  completionState: PeriodChangeState;
  time: string;
  completion: string;
}

function parseDate(value: string): Date {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error(`Invalid study date: ${value}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(value: string, amount: number): string {
  const date = parseDate(value);
  date.setDate(date.getDate() + amount);
  return dateKey(date);
}

function mondayKey(value: string): string {
  const date = parseDate(value);
  const weekday = date.getDay();
  date.setDate(date.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return dateKey(date);
}

function datesBetween(start: string, end: string): string[] {
  const output: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) output.push(cursor);
  return output;
}

function shortDate(value: string, includeYear = false): string {
  const date = parseDate(value);
  const dateText = `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  return includeYear ? `${date.getFullYear()}/${dateText}` : dateText;
}

export function summaryPeriod(anchor: string, mode: SummaryMode): SummaryPeriod {
  const normalizedMode = SUMMARY_MODES.includes(mode) ? mode : 'week';
  const anchorDate = parseDate(anchor);
  if (normalizedMode === 'week') {
    const start = mondayKey(anchor);
    const end = addDays(start, 6);
    const sameYear = parseDate(start).getFullYear() === parseDate(end).getFullYear();
    return {
      mode: 'week', anchor, start, end,
      label: `${shortDate(start, true)}－${shortDate(end, !sameYear)}`,
      dates: datesBetween(start, end),
    };
  }
  const startDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1, 12, 0, 0);
  const endDate = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0, 12, 0, 0);
  const start = dateKey(startDate);
  const end = dateKey(endDate);
  return {
    mode: 'month', anchor, start, end,
    label: `${anchorDate.getFullYear()} 年 ${anchorDate.getMonth() + 1} 月`,
    dates: datesBetween(start, end),
  };
}

export function shiftSummaryAnchor(anchor: string, mode: SummaryMode, direction: -1 | 1): string {
  const date = parseDate(anchor);
  if (mode === 'week') date.setDate(date.getDate() + direction * 7);
  else date.setMonth(date.getMonth() + direction, 1);
  return dateKey(date);
}

function childItems(item: StudyItem, key: string): StudyItem[] {
  const value = item.f?.[key];
  return Array.isArray(value) ? value.filter(Boolean) as StudyItem[] : [];
}

function groupedChildren(item: StudyItem): StudyItem[] {
  return childItems(item, 'groupedWorkEntries');
}

function confirmedDeferred(item: StudyItem): boolean {
  return isConfirmedDeferred(item);
}

function isWeeklyCalendarItem(item: StudyItem): boolean {
  return item.source === 'preset' && item.f?.calendarRoute === 'week';
}

function visibleItems(record: StudyRecord): StudyItem[] {
  const items = Array.isArray(record.items) ? record.items : [];
  return activeEnglishTaskItems(record, items);
}

/** These statuses keep their daily progress display but do not affect period completion. */
export function completionIncludedInPeriod(record: Pick<StudyRecord, 'mood'>): boolean {
  const mood = String(record.mood ?? '').trim();
  return mood !== '外出' && mood !== '身體不適';
}

function isSaturdayMakeup(item: StudyItem): boolean {
  return item.type === 'general'
    && (effectiveTemplatePresetKey(item) === 'sat_makeup' || item.title === '回補本週未完成項目');
}

function isCalendarNaturalIntegration(item: StudyItem): boolean {
  return Boolean(item.f?.calendarNaturalIntegration && childItems(item, 'calendarIntegrationEntries').length);
}

function isCalendarMakeup(item: StudyItem): boolean {
  return item.source === 'preset' && item.f?.calendarMakeup === true;
}

function hasMergedCalendarMakeup(item: StudyItem): boolean {
  return item.f?.calendarIncludesMakeup === true;
}

/** Maps a stored Tracker record onto the existing completion-metric primitives. */
export function summaryCompletionUnitsForRecord(record: StudyRecord): CompletionUnit[] {
  const units: CompletionUnit[] = [];
  for (const item of visibleItems(record)) {
    if (!item || isWeeklyCalendarItem(item)) continue;
    const grouped = groupedChildren(item);
    if (grouped.length) {
      for (const child of grouped) {
        if (isInteractiveStudyItem(child)) continue;
        const deferred = confirmedDeferred(item) || confirmedDeferred(child);
        units.push(...(
          item.deferredCarry || child.deferredCarry || child.required === false
            ? groupedMakeupCompletionUnits([Boolean(child.done)], deferred)
            : groupedOriginalCompletionUnits([Boolean(child.done)], deferred)
        ));
      }
      continue;
    }
    if (isInteractiveStudyItem(item)) continue;
    if (item.deferredCarry) {
      let completed = Boolean(item.done);
      const integration = childItems(item, 'calendarIntegrationEntries');
      if (integration.length) completed = integration.every(child => Boolean(child.done));
      units.push(makeupCompletionUnit(completed, confirmedDeferred(item)));
      continue;
    }
    if (!item.required) {
      const eligible = item.source === 'custom' || isCalendarMakeup(item) || hasMergedCalendarMakeup(item);
      if (eligible && item.type && specialItemTemplate(item) !== 'englishReview') {
        units.push(makeupCompletionUnit(Boolean(item.done), confirmedDeferred(item)));
      }
      continue;
    }
    if (isSaturdayMakeup(item)) {
      units.push(originalCompletionUnit(Boolean(item.done), confirmedDeferred(item)));
      for (const child of childItems(item, 'makeupEntries')) {
        if (child?.type && !isInteractiveStudyItem(child)) units.push(makeupCompletionUnit(Boolean(child.done), confirmedDeferred(item) || confirmedDeferred(child)));
      }
      continue;
    }
    if (isCalendarNaturalIntegration(item)) {
      const children = childItems(item, 'calendarIntegrationEntries');
      for (const child of children) {
        units.push({ ...originalCompletionUnit(Boolean(child.done), confirmedDeferred(item)), workloadIncluded: false });
      }
      units.push(makeupCompletionUnit(children.every(child => Boolean(child.done)), confirmedDeferred(item)));
      continue;
    }
    units.push(originalCompletionUnit(Boolean(item.done), confirmedDeferred(item)));
    if (hasMergedCalendarMakeup(item)) units.push(makeupCompletionUnit(Boolean(item.done), confirmedDeferred(item)));
  }
  return units;
}

export function classifyPeriodChange(current: number, previous: number): PeriodChangeState {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'stable';
  if (previous === 0) {
    if (current > 0) return 'increase';
    if (current < 0) return 'decrease';
    return 'stable';
  }
  const percentChange = ((current - previous) / Math.abs(previous)) * 100;
  if (percentChange >= 5) return 'increase';
  if (percentChange <= -5) return 'decrease';
  return 'stable';
}

function classifyCompletionChange(delta: number): PeriodChangeState {
  if (delta >= 5) return 'increase';
  if (delta <= -5) return 'decrease';
  return 'stable';
}

export function fixedPeriodRemarks(
  currentMinutes: number,
  previousMinutes: number,
  currentCompletion: number,
  previousCompletion: number,
): FixedPeriodRemarks {
  const timeState = classifyPeriodChange(currentMinutes, previousMinutes);
  // Completion is already a percentage, so compare percentage-point change.
  const completionDelta = currentCompletion - previousCompletion;
  const completionState = classifyCompletionChange(completionDelta);
  const timeRemarks: Record<PeriodChangeState, string> = {
    increase: '本期學習時數增加，建議維持目前節奏，同時留意休息與負荷。',
    stable: '本期學習時數大致穩定，可以繼續觀察目前安排是否適合。',
    decrease: '本期學習時數下降，可回顧近期狀態與排程，確認是否需要調整。',
  };
  const completionRemarks: Record<PeriodChangeState, string> = {
    increase: '本期完成率提升，可以觀察哪些安排有助於任務順利完成。',
    stable: '本期完成率大致穩定，可繼續維持並觀察較常卡住的項目。',
    decrease: '本期完成率下降，可檢查是否有任務過多、延期集中或安排不適合的情況。',
  };
  return {
    timeState,
    completionState,
    time: timeRemarks[timeState],
    completion: completionRemarks[completionState],
  };
}

export function summarizeLearningPeriod(
  records: StudyRecord[],
  period: SummaryPeriod,
  options: LearningPeriodOptions = {},
): LearningPeriodSummary {
  const byDate = new Map(records.map(record => [record.date, record]));
  const periodRecords = period.dates.map(date => byDate.get(date)).filter(Boolean) as StudyRecord[];
  const includeRecordInCompletion = (record: StudyRecord): boolean => (
    options.includeStatusDaysInCompletion === true || completionIncludedInPeriod(record)
  );
  const allUnits = periodRecords
    .filter(includeRecordInCompletion)
    .flatMap(summaryCompletionUnitsForRecord);
  // A task can be checked from another date's card. Its minutes belong to the
  // actual check date, so source records outside this period must also be read.
  const timeEntries = completedStudyTimeEntries(records)
    .filter(entry => entry.date >= period.start && entry.date <= period.end);
  const timeEntriesByDate = new Map<string, CompletedStudyTimeEntry[]>();
  timeEntries.forEach(entry => timeEntriesByDate.set(entry.date, [...(timeEntriesByDate.get(entry.date) ?? []), entry]));
  const days = period.dates.map(date => {
    const record = byDate.get(date);
    const dayEntries = timeEntriesByDate.get(date) ?? [];
    const subjectTime = summarizeSubjectTime(dayEntries);
    const makeupMinutes = summarizeSubjectTime(dayEntries.filter(entry => (entry.scheduledDate ?? entry.date) < entry.date)).totalMinutes;
    if (!record) {
      return {
        date, dayNumber: parseDate(date).getDate(), weekday: ['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getDay()],
        hasRecord: subjectTime.totalMinutes > 0, mood: '', totalMinutes: subjectTime.totalMinutes, makeupMinutes, completionPercent: 0,
        completionIncludedInPeriod: false,
      };
    }
    const completion = summarizeCompletionUnits(summaryCompletionUnitsForRecord(record));
    return {
      date, dayNumber: parseDate(date).getDate(), weekday: ['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getDay()],
      hasRecord: true, mood: String(record.mood ?? '').trim(), totalMinutes: subjectTime.totalMinutes, makeupMinutes,
      completionPercent: completion.settlementPercent,
      completionIncludedInPeriod: includeRecordInCompletion(record),
    };
  });
  return {
    period,
    days,
    records: periodRecords,
    completion: summarizeCompletionUnits(allUnits),
    subjectTime: summarizeSubjectTime(timeEntries),
    timeEntries,
    recordedDayCount: new Set([...periodRecords.map(record => record.date), ...timeEntries.map(entry => entry.date)]).size,
  };
}

export function calendarLeadingBlankCount(period: SummaryPeriod): number {
  if (period.mode !== 'month') return 0;
  const weekday = parseDate(period.start).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}
