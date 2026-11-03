import { overdueTasks, updateOverdueTaskSkip, type OverdueTaskEntry } from './overdueTasks.ts';
import type { StudyRecord } from '../types.ts';

export type OverdueSort = 'oldest' | 'newest';
export function normalizedOverdueSort(value: unknown): OverdueSort { return value === 'newest' ? 'newest' : 'oldest'; }

export function organizedOverdueEntries(entries: readonly OverdueTaskEntry[], order: OverdueSort): {
  recent: OverdueTaskEntry[]; longTerm: OverdueTaskEntry[];
} {
  const sorted = [...entries].sort(function compare(left, right): number {
    const dates = left.recordDate.localeCompare(right.recordDate);
    return (order === 'newest' ? -dates : dates) || left.key.localeCompare(right.key, 'zh-TW', { numeric: true });
  });
  return { recent: sorted.filter(entry => entry.daysOverdue <= 30), longTerm: sorted.filter(entry => entry.daysOverdue > 30) };
}

export function skipOverdueRecordBatch(record: StudyRecord, itemIds: readonly string[], today: string, handledAt: string): {
  record: StudyRecord | null; skipped: number;
} {
  const eligible = new Set(overdueTasks([record], today).map(entry => entry.itemId));
  let updated = record, skipped = 0;
  for (const id of new Set(itemIds)) {
    if (!eligible.has(id)) continue;
    const next = updateOverdueTaskSkip(updated, id, today, handledAt);
    if (next) { updated = next; skipped += 1; }
  }
  return { record: skipped ? updated : null, skipped };
}
