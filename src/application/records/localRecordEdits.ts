import { LocalStudyRecordRepository, type KeyValueStorage } from '../../infrastructure/storage/localStudyRecordRepository.ts';
import {
  markRecordLocallyEdited, mergeStudyRecordsThreeWay, sameStudyContent,
  type StudyRecordMergeResult,
} from '../../storage/recordSync.ts';
import type { StudyRecord } from '../../types.ts';
import { studyRecordConflictLocations } from '../../storage/conflictPresentation.ts';

/** Shares the editor's loaded-base merge with standalone pages. */
export function reconcileLocalRecordEdit(draft: StudyRecord, latest: StudyRecord | null, base: StudyRecord): StudyRecordMergeResult {
  if (!latest || sameStudyContent(latest, base)) {
    return { record: draft, conflicts: [], usedThreeWayMerge: false };
  }
  return mergeStudyRecordsThreeWay(draft, latest, base);
}

export function saveLocalRecordEdit(
  storage: KeyValueStorage, prefix: string, base: StudyRecord,
  update: (record: StudyRecord) => StudyRecord | null,
): StudyRecord | null {
  const repository = new LocalStudyRecordRepository(storage, prefix);
  const loaded = repository.loadResult(base.date);
  if (loaded.status !== 'ok') throw new Error('原始紀錄已變更或無法讀取，請返回 Tracker 確認；尚未覆蓋資料。');
  const draft = update(base);
  if (!draft) return null;
  const merged = reconcileLocalRecordEdit(draft, loaded.record, base);
  if (merged.conflicts.length) {
    const fields = studyRecordConflictLocations(merged.conflicts, draft, loaded.record).join('、');
    throw new Error(`同一欄位已在其他頁籤更新：${fields}。請重新讀取確認後再儲存，輸入草稿仍保留。`);
  }
  const edited = markRecordLocallyEdited(merged.record, loaded.record);
  if (!repository.save(edited)) throw new Error('無法儲存本機紀錄。請確認瀏覽器儲存空間及權限，輸入仍保留。');
  return edited;
}
