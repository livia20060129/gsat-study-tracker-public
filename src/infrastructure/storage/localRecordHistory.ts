import { decodeStudyRecord } from '../../storage/studyRecordCodec.ts';
import type { StudyRecord } from '../../types.ts';

type HistoryStorage = Pick<Storage, 'length' | 'key' | 'getItem'>;
const browserHistories = new WeakMap<HistoryStorage, LocalRecordHistory>();

function freezeSnapshot<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeSnapshot(child);
    Object.freeze(value);
  }
  return value;
}

/** Read-only history for calculations; transactional writes still read fresh repository data. */
export class LocalRecordHistory {
  private prefix = '';
  private length = -1;
  private readonly rows = new Map<string, { raw: string; record: StudyRecord }>();
  private readonly dirty = new Set<string>();
  private scan = true;

  private readonly storage: HistoryStorage;

  constructor(storage: HistoryStorage) { this.storage = storage; }

  invalidate(key: string | null = null): void {
    if (key === null) this.scan = true;
    else {
      if (key.startsWith(this.prefix) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(this.prefix.length))) {
        this.dirty.add(key.slice(this.prefix.length));
      }
      // A known write supplies its key, so a new metadata key must not trigger a full date scan.
      this.length = this.storage.length;
    }
  }

  read(prefix: string, fresh = false): StudyRecord[] {
    if (prefix !== this.prefix) {
      this.prefix = prefix;
      this.rows.clear();
      this.dirty.clear();
      this.scan = true;
    }
    if (fresh || this.scan || this.length !== this.storage.length) {
      const dates = new Set<string>();
      for (let index = 0; index < this.storage.length; index += 1) {
        const key = this.storage.key(index) ?? '';
        if (key.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}$/.test(key.slice(prefix.length))) dates.add(key.slice(prefix.length));
      }
      for (const date of this.rows.keys()) if (!dates.has(date)) this.rows.delete(date);
      for (const date of dates) this.dirty.add(date);
      this.scan = false;
    }
    for (const date of this.dirty) {
      try {
        const raw = this.storage.getItem(prefix + date);
        if (!raw) { this.rows.delete(date); continue; }
        if (this.rows.get(date)?.raw === raw) continue;
        const decoded = decodeStudyRecord(raw, date);
        if (decoded.ok) this.rows.set(date, { raw, record: freezeSnapshot(decoded.record) });
        else this.rows.delete(date);
      } catch { this.rows.delete(date); }
    }
    this.dirty.clear();
    this.length = this.storage.length;
    return [...this.rows.values()].map(row => row.record).sort((left, right) => left.date.localeCompare(right.date));
  }
}

export function readBrowserRecordHistory(storage: HistoryStorage, prefix: string, fresh = false): StudyRecord[] {
  let history = browserHistories.get(storage);
  if (!history) { history = new LocalRecordHistory(storage); browserHistories.set(storage, history); }
  return history.read(prefix, fresh);
}

export function invalidateLocalRecordHistory(storage: HistoryStorage, key: string | null = null): void {
  browserHistories.get(storage)?.invalidate(key);
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', function changed(event): void {
    try { invalidateLocalRecordHistory(event.storageArea ?? localStorage, event.key); } catch { /* Unavailable storage has no cached history. */ }
  });
  window.addEventListener('pageshow', function restored(event): void {
    if (event.persisted) { try { invalidateLocalRecordHistory(localStorage); } catch { /* Storage is unavailable. */ } }
  });
  window.addEventListener('focus', function refocused(): void {
    try { invalidateLocalRecordHistory(localStorage); } catch { /* Storage is unavailable. */ }
  });
}
