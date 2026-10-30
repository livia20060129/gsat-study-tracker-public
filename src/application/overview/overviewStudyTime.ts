import type { StudyRecord } from '../../types.ts';
import {
  completedStudyTimeEntries,
  type CompletedStudyTimeEntry,
} from '../../study/completedStudyTime.ts';

/** Replaces a stored record with the unsaved in-memory draft for the same date. */
export function recordsWithLiveStudyDraft(
  storedRecords: StudyRecord[],
  liveRecord?: StudyRecord | null,
): StudyRecord[] {
  const recordsByDate = new Map<string, StudyRecord>();
  storedRecords.forEach(function addStoredRecord(record): void {
    if (record?.date) recordsByDate.set(record.date, record);
  });
  if (liveRecord?.date) recordsByDate.set(liveRecord.date, liveRecord);
  return [...recordsByDate.values()];
}

/** Returns every completed task whose actual check date belongs to the requested overview day. */
export function completedTimeEntriesForOverviewDate(
  storedRecords: StudyRecord[],
  liveRecord: StudyRecord | null | undefined,
  date: string,
): CompletedStudyTimeEntry[] {
  const records = recordsWithLiveStudyDraft(storedRecords, liveRecord);
  return completedStudyTimeEntries(records).filter(function matchesOverviewDate(entry): boolean {
    return entry.date === date;
  });
}
