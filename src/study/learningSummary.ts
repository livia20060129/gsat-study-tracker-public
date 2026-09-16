import type { CompletionMetrics, CompletionUnit } from './completionMetrics.ts';
import {
  groupedMakeupCompletionUnits,
  groupedOriginalCompletionUnits,
  makeupCompletionUnit,
  originalCompletionUnit,
  summarizeCompletionUnits,
} from './completionMetrics.ts';
import { isConfirmedDeferred } from './deferDays.ts';
import { effectiveTemplatePresetKey, specialItemTemplate } from './makeup.ts';
import { studyItemSubject } from './subjectOrder.ts';
import { summarizeSubjectTime, type SubjectTimeSubject, type SubjectTimeSummary } from './subjectTime.ts';
import type { StudyItem, StudyRecord } from '../types.ts';

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
  completionPercent: number;
  wakeMinutes: number | null;
}

export interface LearningPeriodSummary {
  period: SummaryPeriod;
  days: LearningSummaryDay[];
  records: StudyRecord[];
  completion: CompletionMetrics;
  subjectTime: SubjectTimeSummary;
  timeEntries: CompletedStudyTimeEntry[];
  averageWakeMinutes: number | null;
  recordedDayCount: number;
}

export interface CompletedStudyTimeEntry {
  key: string;
  date: string;
  subject: SubjectTimeSubject;
  itemLabel: string;
  minutes: number;
}

export interface StudyItemTimeSlice {
  label: string;
  minutes: number;
  percent: number;
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
  return items.filter(item => !(record.mood === '外出' && item?.source === 'preset'));
}

function isSaturdayMakeup(item: StudyItem): boolean {
  return item.type === 'general'
    && (effectiveTemplatePresetKey(item) === 'sat_makeup' || item.title === '回補本週未完成項目');
}

function isInteractiveDaily(item: StudyItem): boolean {
  return specialItemTemplate(item) === 'interactiveDaily';
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
        const deferred = confirmedDeferred(item) || confirmedDeferred(child);
        units.push(...(
          item.deferredCarry || child.deferredCarry || child.required === false
            ? groupedMakeupCompletionUnits([Boolean(child.done)], deferred)
            : groupedOriginalCompletionUnits([Boolean(child.done)], deferred)
        ));
      }
      continue;
    }
    if (item.deferredCarry) {
      let completed = Boolean(item.done);
      const interactive = childItems(item, 'interactiveEntries');
      const integration = childItems(item, 'calendarIntegrationEntries');
      if (interactive.length) completed = interactive.every(child => Boolean(child.done));
      else if (integration.length) completed = integration.every(child => Boolean(child.done));
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
        if (child?.type) units.push(makeupCompletionUnit(Boolean(child.done), confirmedDeferred(item) || confirmedDeferred(child)));
      }
      continue;
    }
    if (isInteractiveDaily(item)) {
      const children = childItems(item, 'interactiveEntries');
      const completed = children.length > 0 && children.every(child => Boolean(child.done));
      units.push(originalCompletionUnit(completed, confirmedDeferred(item)));
      if (hasMergedCalendarMakeup(item)) units.push(makeupCompletionUnit(completed, confirmedDeferred(item)));
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

function numericMinutes(value: unknown): number {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizedTimeSubject(item: StudyItem, fallback?: SubjectTimeSubject): SubjectTimeSubject {
  const scienceIdentity = [item.f?.subject, item.f?.title, item.title, item.type].map(text).join(' ');
  if (/物理|physics/i.test(scienceIdentity)) return '物理';
  if (/化學|chemistry/i.test(scienceIdentity)) return '化學';
  if (/生物|biology/i.test(scienceIdentity)) return '生物';
  if (/地科|地球科學|earth/i.test(scienceIdentity)) return '地科';
  const subject = studyItemSubject(item);
  if (subject !== '其他' && ['數學', '國文', '英文', '自然'].includes(subject)) {
    return subject as SubjectTimeSubject;
  }
  return fallback ?? '其他';
}

function withoutSubjectPrefix(value: unknown): string {
  return text(value)
    .replace(/^(?:數學\s*A?|數\s*A|國文|英文|自然|社會|物理|化學|生物|地科)\s*(?:[｜|：:·\-–—]\s*)?/i, '')
    .trim();
}

function withoutRoundSuffix(value: string, round: unknown): string {
  const roundText = text(round);
  if (!value || !roundText) return value;
  const escapedRound = roundText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return value.replace(
    new RegExp(`\\s*(?:[｜|：:·\\-–—]\\s*)?(?:第\\s*${escapedRound}\\s*回|Test\\s*${escapedRound}|${escapedRound}\\s*回)\\s*$`, 'i'),
    '',
  ).trim();
}

function lectureVersionLabel(item: StudyItem): string {
  const material = withoutSubjectPrefix(item.f?.material);
  const rawBook = text(item.f?.book);
  const book = rawBook && !/冊$/.test(rawBook) ? `${rawBook}冊` : rawBook;
  return [material, book]
    .filter(Boolean)
    .filter((part, index, parts) => index === 0 || !parts[0].includes(part))
    .join(' ');
}

function normalizedMagazineLabel(value: string): string {
  if (/^(?:CNN\s*互動(?:英文|英語)|常春藤)$/i.test(value.trim())) return '雜誌';
  return value;
}

function studyItemTimeLabel(item: StudyItem, fallback = ''): string {
  const explicit = withoutRoundSuffix(withoutSubjectPrefix(text(item.f?.title) || text(item.title)), item.f?.round);
  const fallbackLabel = withoutRoundSuffix(withoutSubjectPrefix(fallback), item.f?.round);
  const lectureVersion = lectureVersionLabel(item);
  if (item.type === 'magazine') return normalizedMagazineLabel(fallbackLabel || explicit) || '雜誌';
  if (item.type === 'englishVocabInteractive') return '單字／片語';
  if (item.type === 'englishMixedWriting') return '混合題與作文';
  if (item.type === 'mathStudy' || item.type === 'mathLecture') return lectureVersion ? `${lectureVersion}｜進度` : '講義進度';
  if (item.type === 'mathPractice') return lectureVersion ? `${lectureVersion}｜題目` : '講義題目';
  if (item.type === 'mathOral' || item.type === 'biologyInteractive') return '互動題';
  if (item.type === 'scienceReview') return lectureVersion || explicit || fallbackLabel || '講義複習';
  if (item.type === 'chineseReading') return explicit || fallbackLabel || '閱讀';
  if (item.type === 'mock') return explicit || '歷屆／模考';
  if (item.type === 'englishPractice') return explicit || fallbackLabel || '閱讀／練習';
  return explicit || fallbackLabel || '其他項目';
}

function stableTimeKey(recordDate: string, item: StudyItem, label: string, childKey = ''): string {
  const fields = item.f ?? {};
  const originId = text(item.deferredOriginId)
    || (Array.isArray(item.deferredOriginIds) ? text(item.deferredOriginIds[0]) : '');
  const calendarKey = text(fields.calendarEventKey)
    || text(fields.calendarEventId)
    || (Array.isArray(fields.calendarEventKeys) ? text(fields.calendarEventKeys[0]) : '');
  const semantic = [item.type, label, fields.start, fields.end, fields.round, fields.unit, childKey]
    .map(text).join('|');
  if (originId) return `origin:${originId}:${semantic}`;
  if (calendarKey) return `calendar:${calendarKey}:${semantic}`;
  if (item.id) return `item:${recordDate}:${item.id}:${childKey}`;
  return `record:${recordDate}:${semantic}`;
}

function addCompletedTime(
  output: CompletedStudyTimeEntry[],
  recordDate: string,
  item: StudyItem,
  minutes: number,
  fallbackSubject?: SubjectTimeSubject,
  fallbackLabel = '',
  childKey = '',
): void {
  if (minutes <= 0) return;
  const subject = normalizedTimeSubject(item, fallbackSubject);
  const itemLabel = studyItemTimeLabel(item, fallbackLabel);
  output.push({
    key: stableTimeKey(recordDate, item, itemLabel, childKey),
    date: recordDate,
    subject,
    itemLabel,
    minutes,
  });
}

function collectCompletedTime(
  item: StudyItem,
  recordDate: string,
  output: CompletedStudyTimeEntry[],
  fallbackSubject?: SubjectTimeSubject,
  fallbackLabel = '',
): void {
  // A confirmed deferral belongs to its final target date, never its old date.
  if (confirmedDeferred(item)) return;
  const itemSubject = normalizedTimeSubject(item, fallbackSubject);
  const itemLabel = studyItemTimeLabel(item, fallbackLabel);
  const grouped = groupedChildren(item);
  if (grouped.length) {
    grouped.forEach(child => collectCompletedTime(child, recordDate, output, itemSubject, itemLabel));
    return;
  }
  const interactive = childItems(item, 'interactiveEntries');
  if (interactive.length) {
    interactive.forEach(child => collectCompletedTime(child, recordDate, output, itemSubject, itemLabel));
    return;
  }
  const integration = childItems(item, 'calendarIntegrationEntries');
  if (integration.length) {
    integration.forEach(child => collectCompletedTime(child, recordDate, output, itemSubject, itemLabel));
    return;
  }
  if (isSaturdayMakeup(item)) {
    childItems(item, 'makeupEntries').forEach(child => collectCompletedTime(child, recordDate, output, itemSubject, itemLabel));
    return;
  }
  const reviewEntries = childItems(item, 'reviewEntries');
  if (reviewEntries.length) {
    reviewEntries.forEach(child => collectCompletedTime(child, recordDate, output, itemSubject, itemLabel));
    return;
  }
  if (!item.done) return;
  if (specialItemTemplate(item) === 'fixedMagazine') {
    const entries = Array.isArray(item.f?.entries)
      ? item.f.entries as Array<{ id?: unknown; name?: unknown; minutes?: unknown }>
      : [];
    entries.forEach((entry, index) => {
      const label = text(entry?.name) || itemLabel;
      addCompletedTime(
        output, recordDate, item, numericMinutes(entry?.minutes), itemSubject, label,
        `magazine:${text(entry?.id) || `${label}:${index}`}`,
      );
    });
    return;
  }
  const minutes = numericMinutes(item.minutes);
  addCompletedTime(output, recordDate, item, minutes, fallbackSubject, fallbackLabel);
}

/** Deduplicates the same saved/deferred/Calendar task and keeps its strongest completed record. */
export function completedStudyTimeEntries(records: StudyRecord[]): CompletedStudyTimeEntry[] {
  const unique = new Map<string, CompletedStudyTimeEntry>();
  for (const record of records) {
    const candidates: CompletedStudyTimeEntry[] = [];
    visibleItems(record)
      .filter(item => !isWeeklyCalendarItem(item))
      .forEach(item => collectCompletedTime(item, record.date, candidates));
    for (const candidate of candidates) {
      const existing = unique.get(candidate.key);
      if (!existing || candidate.minutes > existing.minutes
        || (candidate.minutes === existing.minutes && candidate.date > existing.date)) {
        unique.set(candidate.key, candidate);
      }
    }
  }
  return [...unique.values()].sort((left, right) => left.date.localeCompare(right.date) || left.key.localeCompare(right.key));
}

export function completedSubjectTimeForRecord(record: StudyRecord): SubjectTimeSummary {
  return summarizeSubjectTime(completedStudyTimeEntries([record]));
}

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function summarizeStudyItemTime(
  entries: CompletedStudyTimeEntry[],
  subject: SubjectTimeSubject,
): { totalMinutes: number; slices: StudyItemTimeSlice[] } {
  const totals = new Map<string, number>();
  entries.filter(entry => entry.subject === subject).forEach(entry => {
    totals.set(entry.itemLabel, (totals.get(entry.itemLabel) ?? 0) + entry.minutes);
  });
  const sorted = [...totals.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hant'));
  const totalMinutes = roundOne(sorted.reduce((sum, entry) => sum + entry[1], 0));
  let allocated = 0;
  const slices = sorted.map(([label, minutes], index) => {
    const percent = index === sorted.length - 1
      ? roundOne(100 - allocated)
      : roundOne(totalMinutes > 0 ? minutes / totalMinutes * 100 : 0);
    allocated = roundOne(allocated + percent);
    return { label, minutes: roundOne(minutes), percent };
  });
  return { totalMinutes, slices };
}

export function classifyPeriodChange(current: number, previous: number): PeriodChangeState {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 'stable';
  if (previous === 0) return current > 0 ? 'increase' : current < 0 ? 'decrease' : 'stable';
  const percentChange = ((current - previous) / Math.abs(previous)) * 100;
  if (percentChange >= 5) return 'increase';
  if (percentChange <= -5) return 'decrease';
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
  const completionState: PeriodChangeState = completionDelta >= 5
    ? 'increase'
    : completionDelta <= -5
      ? 'decrease'
      : 'stable';
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

export function wakeTimeMinutes(value: unknown): number | null {
  const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

export function summarizeLearningPeriod(records: StudyRecord[], period: SummaryPeriod): LearningPeriodSummary {
  const byDate = new Map(records.map(record => [record.date, record]));
  const periodRecords = period.dates.map(date => byDate.get(date)).filter(Boolean) as StudyRecord[];
  const allUnits = periodRecords.flatMap(summaryCompletionUnitsForRecord);
  const timeEntries = completedStudyTimeEntries(periodRecords);
  const timeEntriesByDate = new Map<string, CompletedStudyTimeEntry[]>();
  timeEntries.forEach(entry => timeEntriesByDate.set(entry.date, [...(timeEntriesByDate.get(entry.date) ?? []), entry]));
  const wakeValues: number[] = [];
  const days = period.dates.map(date => {
    const record = byDate.get(date);
    if (!record) {
      return {
        date, dayNumber: parseDate(date).getDate(), weekday: ['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getDay()],
        hasRecord: false, mood: '', totalMinutes: 0, completionPercent: 0, wakeMinutes: null,
      };
    }
    const completion = summarizeCompletionUnits(summaryCompletionUnitsForRecord(record));
    const subjectTime = summarizeSubjectTime(timeEntriesByDate.get(date) ?? []);
    const wakeMinutes = wakeTimeMinutes(record.wakeTime);
    if (wakeMinutes !== null) wakeValues.push(wakeMinutes);
    return {
      date, dayNumber: parseDate(date).getDate(), weekday: ['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getDay()],
      hasRecord: true, mood: String(record.mood ?? '').trim(), totalMinutes: subjectTime.totalMinutes,
      completionPercent: completion.settlementPercent, wakeMinutes,
    };
  });
  return {
    period,
    days,
    records: periodRecords,
    completion: summarizeCompletionUnits(allUnits),
    subjectTime: summarizeSubjectTime(timeEntries),
    timeEntries,
    averageWakeMinutes: wakeValues.length ? Math.round(wakeValues.reduce((sum, value) => sum + value, 0) / wakeValues.length) : null,
    recordedDayCount: periodRecords.length,
  };
}

export function formatClockMinutes(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const normalized = Math.round(value);
  return `${String(Math.floor(normalized / 60) % 24).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

export function calendarLeadingBlankCount(period: SummaryPeriod): number {
  if (period.mode !== 'month') return 0;
  const weekday = parseDate(period.start).getDay();
  return weekday === 0 ? 6 : weekday - 1;
}
