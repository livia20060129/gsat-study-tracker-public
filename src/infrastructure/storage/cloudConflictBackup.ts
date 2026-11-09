import type { StudyRecord } from '../../types.ts';
import type { KeyValueStorage } from './localStudyRecordRepository.ts';
import { compactConfirmedRecordStorage, isStorageQuotaError } from './localRecordCompaction.ts';
import { decodeStudyRecord, encodeLocalStudyRecord } from '../../storage/studyRecordCodec.ts';

export interface CloudConflictBackup {
  version: 1;
  date: string;
  createdAt: string;
  local: StudyRecord | null;
  cloud: StudyRecord | null;
  resolvedRevision: number | null;
}

/** Confirmed baselines are reconstructed on read; dirty/conflict history stays intact. */
export function readRecoverableCloudBackup(storage: Pick<KeyValueStorage,'getItem'>, key: string): CloudConflictBackup | null {
  try {
    const value=JSON.parse(storage.getItem(key)??'null');
    if(value?.version!==1 || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return null;
    for(const side of ['local','cloud'] as const) {
      if(value[side]===null) continue;
      const decoded=decodeStudyRecord(value[side],value.date);
      if(!decoded.ok) return null;
      value[side]=decoded.record;
    }
    return value as CloudConflictBackup;
  } catch { return null; }
}

export function writeRecoverableCloudBackup(storage: KeyValueStorage, key: string, value: CloudConflictBackup): {ok:boolean; reason:string} {
  try {
    const encoded=JSON.stringify({...value,
      local:value.local ? JSON.parse(encodeLocalStudyRecord(value.local)) : null,
      cloud:value.cloud ? JSON.parse(encodeLocalStudyRecord(value.cloud)) : null});
    try { storage.setItem(key,encoded); }
    catch(cause) {
      if(!isStorageQuotaError(cause)) throw cause;
      compactConfirmedRecordStorage(storage);
      storage.setItem(key,encoded);
    }
    return {ok:true,reason:''};
  } catch(cause) {
    return {ok:false,reason:isStorageQuotaError(cause)
      ? '瀏覽器本機儲存空間不足，處理前備份未保存；未取代紀錄或既有備份。'
      : '瀏覽器無法寫入處理前備份；請確認此網站的本機儲存權限，未取代任何版本。'};
  }
}
