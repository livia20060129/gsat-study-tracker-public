import { readBrowserRecordHistory } from '../../infrastructure/storage/localRecordHistory.ts';
import { LocalStudyRecordRepository, type KeyValueStorage } from '../../infrastructure/storage/localStudyRecordRepository.ts';
import { markRecordLocallyEdited, sameStudyContent } from '../../storage/recordSync.ts';
import { completedRangeIndex, reconcileRangeCompletion } from '../../study/rangeCompletion.ts';
import type { StudyRecord } from '../../types.ts';

const running = new WeakSet<KeyValueStorage>();

/** The checked record is saved first. Other dates keep their own minutes, inputs and sync bases. */
export function synchronizeRangeCompletion(storage: KeyValueStorage, prefix: string): {
  saved: StudyRecord[]; failedDates: string[];
} {
  const saved: StudyRecord[] = [], failedDates: string[] = [];
  if (running.has(storage)) return { saved, failedDates };
  running.add(storage);
  try {
    const records = readBrowserRecordHistory(storage, prefix);
    const index = completedRangeIndex(records);
    const repository = new LocalStudyRecordRepository(storage, prefix);
    for (const base of records) {
      if (base.syncConflict || base.storageIssue) continue;
      const updated = reconcileRangeCompletion(base, index);
      if (!updated) continue;
      const latest = repository.load(base.date);
      if (!latest || !sameStudyContent(latest, base)) { failedDates.push(base.date); continue; }
      const edited = markRecordLocallyEdited(updated, latest);
      if (repository.save(edited)) saved.push(edited);
      else failedDates.push(base.date);
    }
  } finally { running.delete(storage); }
  return { saved, failedDates };
}
