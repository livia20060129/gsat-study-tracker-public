import type { LocalStudyRecordRepositoryPort } from '../../application/ports/studyRecordRepository.ts';
import type { StudyRecord } from '../../types.ts';
import {
  decodeStudyRecord,
  encodeStudyRecord,
  type StudyRecordDecodeError,
} from '../../storage/studyRecordCodec.ts';

export interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface LocalStudyRecordDecodeIssue {
  source: 'local';
  date: string;
  error: StudyRecordDecodeError;
  raw: string;
  backupKey: string;
  capturedAt: string;
}

export type LocalStudyRecordLoadResult =
  | { status: 'missing' }
  | { status: 'ok'; record: StudyRecord }
  | { status: 'invalid'; issue: LocalStudyRecordDecodeIssue };

interface StoredRecoveryBackup {
  version: 1;
  date: string;
  error: StudyRecordDecodeError;
  raw: string;
  capturedAt: string;
}

/** Owns local record keys and JSON compatibility so the application never parses storage directly. */
export class LocalStudyRecordRepository implements LocalStudyRecordRepositoryPort {
  private readonly storage: KeyValueStorage;
  private prefix: string;

  constructor(storage: KeyValueStorage, prefix: string) {
    this.storage = storage;
    this.prefix = prefix;
  }

  setPrefix(prefix: string): void {
    this.prefix = prefix;
  }

  load(date: string): StudyRecord | null {
    return this.loadFromPrefix(this.prefix, date);
  }

  loadFromPrefix(prefix: string, date: string): StudyRecord | null {
    const result = this.loadResultFromPrefix(prefix, date);
    return result.status === 'ok' ? result.record : null;
  }

  loadResult(date: string): LocalStudyRecordLoadResult {
    return this.loadResultFromPrefix(this.prefix, date);
  }

  loadResultFromPrefix(prefix: string, date: string): LocalStudyRecordLoadResult {
    const raw = this.storage.getItem(prefix + date);
    if (!raw) return { status: 'missing' };
    const decoded = decodeStudyRecord(raw, date);
    if (decoded.ok) return { status: 'ok', record: decoded.record };
    return { status: 'invalid', issue: this.captureDecodeIssue(prefix, date, decoded.error, raw) };
  }

  getDecodeIssue(date: string): LocalStudyRecordDecodeIssue | null {
    const result = this.loadResult(date);
    return result.status === 'invalid' ? result.issue : null;
  }

  private recoveryKey(prefix: string, date: string): string {
    return `${prefix}meta:corrupt-record:${date}`;
  }

  private captureDecodeIssue(
    prefix: string,
    date: string,
    error: StudyRecordDecodeError,
    raw: string,
  ): LocalStudyRecordDecodeIssue {
    const backupKey = this.recoveryKey(prefix, date);
    let capturedAt = new Date().toISOString();
    const existing = this.storage.getItem(backupKey);
    if (existing) {
      try {
        const parsed = JSON.parse(existing) as Partial<StoredRecoveryBackup>;
        if (parsed.raw === raw && parsed.capturedAt) capturedAt = String(parsed.capturedAt);
      } catch {
        // Replace an unreadable recovery envelope while preserving the source record below.
      }
    }
    const backup: StoredRecoveryBackup = { version: 1, date, error, raw, capturedAt };
    try {
      this.storage.setItem(backupKey, JSON.stringify(backup));
    } catch {
      // The issue still carries the untouched raw value even when backup storage is full.
    }
    return { source: 'local', date, error, raw, backupKey, capturedAt };
  }

  save(record: StudyRecord): boolean {
    if (!record?.date) return false;
    try {
      this.storage.setItem(this.prefix + record.date, encodeStudyRecord(record));
      return true;
    } catch {
      return false;
    }
  }

  remove(date: string): void {
    this.storage.removeItem(this.prefix + date);
  }

  listDates(prefix = this.prefix): string[] {
    const dates: string[] = [];
    for (let index = 0; index < this.storage.length; index += 1) {
      const key = this.storage.key(index);
      if (!key?.startsWith(prefix)) continue;
      const date = key.slice(prefix.length);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.push(date);
    }
    return dates.sort();
  }
}
