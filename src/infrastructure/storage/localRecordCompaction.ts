import { decodeStudyRecord, encodeLocalStudyRecord } from '../../storage/studyRecordCodec.ts';
import type { KeyValueStorage } from './localStudyRecordRepository.ts';

export function isStorageQuotaError(cause: unknown): boolean {
  if (!cause || typeof cause !== 'object') return false;
  const error = cause as { name?: string; code?: number };
  return error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || error.code === 22 || error.code === 1014;
}

/** Preserve all records; only replace redundant confirmed sync baselines with a reversible marker. */
export function compactConfirmedRecordStorage(storage: KeyValueStorage): number {
  let compacted = 0;
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  for (const key of keys) {
    if (!key || !/^study-v11:(?:guest|user:[^:]+):\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const decoded = decodeStudyRecord(raw, key.slice(-10));
      if (!decoded.ok) continue;
      const compact = encodeLocalStudyRecord(decoded.record);
      if (compact.length >= raw.length) continue;
      storage.setItem(key, compact);
      compacted += 1;
    } catch { /* One unreadable key must not prevent safe compaction of other confirmed records. */ }
  }
  return compacted;
}
