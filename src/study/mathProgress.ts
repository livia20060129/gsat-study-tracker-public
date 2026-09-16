import type { StudyItem, StudyItemFields, StudyRecord } from '../types';
import { isMathProgressStudyItem } from '../domain/study/studyItemTypes.ts';
import { recordedPageRangeFields } from './recordedPageRange.ts';

export interface MathProgressSummary {
  dailyNewPages: number;
  weeklyNewPages: number;
  weeklyTarget: number;
  weeklyPercent: number;
}

export interface MathProgressIndexView {
  readonly dailyFirstCompletionCounts: ReadonlyMap<string, number>;
}

type PageSetByMaterial = Map<string, Set<number>>;
type DatesByPage = Map<number, Set<string>>;

const TEACHING_BOOKS = new Set(['1', '2', '3A', '4A']);

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizedMaterialKey(fields: StudyItemFields | undefined): string {
  const f = fields ?? {};
  const material = text(f.material);
  const edition = text(f.edition || f.version);
  const book = text(f.book);
  const volume = text(f.volume || f.booklet);

  // Older records only stored 1／2／3A／4A in `book`. Those records came from
  // 教學講義 before `material` was introduced, so keep them in that namespace.
  const normalizedMaterial =
    material || edition || (!material && !edition && TEACHING_BOOKS.has(book) ? '教學講義' : '');
  const normalizedBook = book || volume;

  return `${normalizedMaterial}||${normalizedBook}`;
}

function addRange(out: PageSetByMaterial, fields: StudyItemFields | undefined): void {
  if (!fields) return;
  let start = Number(fields.start);
  let end = Number(fields.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < 1) return;
  if (start > end) [start, end] = [end, start];

  const key = normalizedMaterialKey(fields);
  let pages = out.get(key);
  if (!pages) {
    pages = new Set<number>();
    out.set(key, pages);
  }
  for (let page = Math.floor(start); page <= Math.floor(end); page += 1) pages.add(page);
}

function isSaturdayMakeup(item: StudyItem): boolean {
  return item.type === 'general' &&
    (item.presetKey === 'sat_makeup' || item.title === '回補本週未完成項目');
}

/** A grouped card is presentation-only; its children remain the real progress units. */
function mathProgressLeaves(item: StudyItem): StudyItem[] {
  const children = item.f?.groupedWorkEntries;
  if (!Array.isArray(children) || !children.length) return [item];
  return children.flatMap(mathProgressLeaves);
}

function addCompletedMathItem(out: PageSetByMaterial, item: StudyItem): void {
  for (const leaf of mathProgressLeaves(item)) {
    if (!isMathProgressStudyItem(leaf) || leaf.done !== true) continue;
    const actualFields = recordedPageRangeFields(leaf.f);
    if (!actualFields) continue;
    if (leaf.type === 'mathStudy' || leaf.type === 'mathLecture') addRange(out, actualFields);
  }
}

/**
 * Pure extraction of actually recorded math pages for one study record.
 * A completion checkbox alone never turns a Calendar suggestion into a page
 * record; both an actual recorded range and item completion are required.
 */
export function extractCompletedMathPages(record: StudyRecord | null | undefined): PageSetByMaterial {
  const out: PageSetByMaterial = new Map();
  if (!record || !Array.isArray(record.items)) return out;

  for (const item of record.items) {
    if (!item) continue;
    addCompletedMathItem(out, item);

    if (!isSaturdayMakeup(item)) continue;
    const makeupEntries = item.f?.makeupEntries;
    if (!Array.isArray(makeupEntries)) continue;
    for (const makeup of makeupEntries) {
      if (makeup) addCompletedMathItem(out, makeup);
    }
  }

  return out;
}

function earliestDate(dates: Set<string> | undefined): string | null {
  if (!dates?.size) return null;
  let earliest: string | null = null;
  for (const date of dates) if (earliest === null || date < earliest) earliest = date;
  return earliest;
}

function adjustCount(counts: Map<string, number>, date: string | null, delta: number): void {
  if (!date) return;
  const next = (counts.get(date) ?? 0) + delta;
  if (next <= 0) counts.delete(date);
  else counts.set(date, next);
}

/**
 * Incremental index. Historical records are scanned once on initialization.
 * Later record changes only update the pages affected by that date.
 */
export class MathProgressIndex {
  private readonly datePages = new Map<string, PageSetByMaterial>();
  private readonly pageDatesByMaterial = new Map<string, DatesByPage>();
  private readonly dailyFirstCompletionCounts = new Map<string, number>();

  replaceAll(records: StudyRecord[]): void {
    this.datePages.clear();
    this.pageDatesByMaterial.clear();
    this.dailyFirstCompletionCounts.clear();
    [...records]
      .filter((record) => /^\d{4}-\d{2}-\d{2}$/.test(record?.date ?? ''))
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((record) => this.upsert(record));
  }

  upsert(record: StudyRecord): void {
    const date = record?.date ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;

    const previous = this.datePages.get(date) ?? new Map<string, Set<number>>();
    const next = extractCompletedMathPages(record);
    const materialKeys = new Set([...previous.keys(), ...next.keys()]);

    for (const materialKey of materialKeys) {
      const oldPages = previous.get(materialKey) ?? new Set<number>();
      const newPages = next.get(materialKey) ?? new Set<number>();

      for (const page of oldPages) if (!newPages.has(page)) this.removePageDate(materialKey, page, date);
      for (const page of newPages) if (!oldPages.has(page)) this.addPageDate(materialKey, page, date);
    }

    if (next.size) this.datePages.set(date, next);
    else this.datePages.delete(date);
  }

  remove(date: string): void {
    const previous = this.datePages.get(date);
    if (!previous) return;
    for (const [materialKey, pages] of previous) {
      for (const page of pages) this.removePageDate(materialKey, page, date);
    }
    this.datePages.delete(date);
  }

  view(): MathProgressIndexView {
    return { dailyFirstCompletionCounts: this.dailyFirstCompletionCounts };
  }

  private addPageDate(materialKey: string, page: number, date: string): void {
    let pages = this.pageDatesByMaterial.get(materialKey);
    if (!pages) {
      pages = new Map<number, Set<string>>();
      this.pageDatesByMaterial.set(materialKey, pages);
    }
    let dates = pages.get(page);
    if (!dates) {
      dates = new Set<string>();
      pages.set(page, dates);
    }

    const oldEarliest = earliestDate(dates);
    dates.add(date);
    const newEarliest = earliestDate(dates);
    if (oldEarliest !== newEarliest) {
      adjustCount(this.dailyFirstCompletionCounts, oldEarliest, -1);
      adjustCount(this.dailyFirstCompletionCounts, newEarliest, 1);
    }
  }

  private removePageDate(materialKey: string, page: number, date: string): void {
    const pages = this.pageDatesByMaterial.get(materialKey);
    const dates = pages?.get(page);
    if (!pages || !dates || !dates.has(date)) return;

    const oldEarliest = earliestDate(dates);
    dates.delete(date);
    const newEarliest = earliestDate(dates);
    if (oldEarliest !== newEarliest) {
      adjustCount(this.dailyFirstCompletionCounts, oldEarliest, -1);
      adjustCount(this.dailyFirstCompletionCounts, newEarliest, 1);
    }

    if (!dates.size) pages.delete(page);
    if (!pages.size) this.pageDatesByMaterial.delete(materialKey);
  }
}

function dateFromString(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function dateString(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date: string, days: number): string {
  const value = dateFromString(date);
  value.setDate(value.getDate() + days);
  return dateString(value);
}

function mondayOf(date: string): string {
  const value = dateFromString(date);
  const weekday = value.getDay();
  return addDays(date, -(weekday === 0 ? 6 : weekday - 1));
}

/**
 * Single pure math-progress calculation used by the UI.
 * It never reads localStorage or the DOM and never mutates the index.
 */
export function calculateMathProgress(
  index: MathProgressIndexView,
  date: string,
  weeklyTarget: number,
): MathProgressSummary {
  const dailyNewPages = index.dailyFirstCompletionCounts.get(date) ?? 0;
  const monday = mondayOf(date);
  let weeklyNewPages = 0;
  for (let day = 0; day < 7; day += 1) {
    weeklyNewPages += index.dailyFirstCompletionCounts.get(addDays(monday, day)) ?? 0;
  }

  const target = Number.isFinite(weeklyTarget) && weeklyTarget > 0 ? Math.round(weeklyTarget) : 0;
  const weeklyPercent = target > 0 ? Math.min(100, Math.round((weeklyNewPages / target) * 100)) : 0;

  return {
    dailyNewPages,
    weeklyNewPages,
    weeklyTarget: target,
    weeklyPercent,
  };
}
