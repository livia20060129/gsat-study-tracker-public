import { readBrowserRecordHistory } from '../../infrastructure/storage/localRecordHistory.ts';
import { LocalStudyRecordRepository, type KeyValueStorage } from '../../infrastructure/storage/localStudyRecordRepository.ts';
import { markRecordLocallyEdited, sameStudyContent } from '../../storage/recordSync.ts';
import { completedRangeIndex, reconcileRangeCompletion } from '../../study/rangeCompletion.ts';
import type { StudyRecord } from '../../types.ts';

const running = new WeakSet<KeyValueStorage>();
export interface RangeCompletionFailure { date: string; reason: string }

/** The checked record is saved first. Other dates keep their own minutes, inputs and sync bases. */
export function synchronizeRangeCompletion(storage: KeyValueStorage, prefix: string, forceFresh = false): {
  saved: StudyRecord[]; failedDates: string[]; failures: RangeCompletionFailure[];
} {
  const saved: StudyRecord[] = [], failedDates: string[] = [];
  const failures: RangeCompletionFailure[] = [];
  function failed(date: string, reason: string): void { failedDates.push(date); failures.push({date,reason}); }
  if (running.has(storage)) return { saved, failedDates, failures };
  running.add(storage);
  try {
    if (!forceFresh) {
      const cached=readBrowserRecordHistory(storage,prefix), cachedIndex=completedRangeIndex(cached);
      if (!cached.some(record=>!record.syncConflict&&!record.storageIssue&&reconcileRangeCompletion(record,cachedIndex))) {
        return {saved,failedDates,failures};
      }
    }
    // A transaction needs fresh source evidence and target versions. Another
    // tab may have written before its storage event reaches this page.
    const records = readBrowserRecordHistory(storage, prefix, true);
    const index = completedRangeIndex(records);
    const repository = new LocalStudyRecordRepository(storage, prefix);
    for (const base of records) {
      if (base.syncConflict || base.storageIssue) continue;
      const updated = reconcileRangeCompletion(base, index);
      if (!updated) continue;
      const latest = repository.load(base.date);
      if (!latest || !sameStudyContent(latest, base)) { failed(base.date,'對照期間這一天的本機內容又有更新；已保留較新版本，未套用舊對照。'); continue; }
      const edited = markRecordLocallyEdited(updated, latest);
      if (repository.save(edited)) saved.push(edited);
      else failed(base.date,repository.saveError() || '無法保存這一天的本機完成範圍對照。');
    }
  } finally { running.delete(storage); }
  return { saved, failedDates, failures };
}
