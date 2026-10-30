import { summaryPeriod } from './learningSummary.ts';

export const OVERDUE_PERIODS = ['all', 'month', 'week'] as const;
export type OverduePeriod = typeof OVERDUE_PERIODS[number];

export interface OverduePeriodRange {
  start: string;
  end: string;
}

export function normalizedOverduePeriod(value: unknown): OverduePeriod {
  return OVERDUE_PERIODS.includes(value as OverduePeriod) ? value as OverduePeriod : 'all';
}

export function overduePeriodIndex(period: OverduePeriod): number {
  return Math.max(0, OVERDUE_PERIODS.indexOf(period));
}

/** Reuse summary's calendar month and Monday-to-Sunday week; never use a rolling window. */
export function overduePeriodRange(period: OverduePeriod, today: string): OverduePeriodRange | null {
  if (period === 'all') return null;
  const { start, end } = summaryPeriod(today, period);
  return { start, end };
}

/** Filter only the view by original scheduled date, without modifying records or entry order. */
export function overdueEntriesForPeriod<T extends { recordDate: string }>(
  entries: readonly T[], period: OverduePeriod, today: string,
): T[] {
  const range = overduePeriodRange(period, today);
  if (!range) return [...entries];
  return entries.filter(entry => entry.recordDate >= range.start && entry.recordDate <= range.end);
}
