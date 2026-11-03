import type { CalendarTaskRow } from '../../calendar/calendarBridge.ts';

interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface CalendarRequestToken {
  userId: string;
  generation: number;
  sequence: number;
}

export interface CalendarScheduleSnapshot {
  version: 1;
  userId: string;
  savedAt: string;
  rows: CalendarTaskRow[];
}

type ScheduleSource = 'builtin' | 'pending' | 'fresh' | 'cached' | 'records';

export function calendarSnapshotKey(userId: string): string {
  return 'study-v11:calendar-snapshot:' + encodeURIComponent(userId);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Keep only fields used for scheduling; never retain auth fields or opaque metadata. */
function snapshotRows(value: unknown): CalendarTaskRow[] | null {
  if (!Array.isArray(value)) return null;
  const rows: CalendarTaskRow[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.event_key !== 'string' || !row.event_key || !validDate(row.event_date)
      || typeof row.source_event_id !== 'string' || typeof row.calendar_id !== 'string'
      || typeof row.title !== 'string' || typeof row.description !== 'string' || typeof row.category !== 'string') return null;
    rows.push({
      event_key: row.event_key, event_date: row.event_date, source_event_id: row.source_event_id,
      calendar_id: row.calendar_id, title: row.title, description: row.description, category: row.category,
      event_updated_at: typeof row.event_updated_at === 'string' ? row.event_updated_at : null,
    });
  }
  return rows;
}

function nowIso(): string { return new Date().toISOString(); }

/** Account-scoped last-known-good schedules with invalidation of late async responses. */
export class CalendarScheduleContinuity {
  private userId: string | null = null;
  private generation = 0;
  private requestSequence = 0;
  private saved: CalendarScheduleSnapshot | null = null;
  source: ScheduleSource = 'builtin';
  persisted = false;
  private readonly storage: SnapshotStorage;
  private readonly now: () => string;

  constructor(storage: SnapshotStorage, now: () => string = nowIso) {
    this.storage = storage;
    this.now = now;
  }

  get sequence(): number { return this.requestSequence; }
  get snapshot(): CalendarScheduleSnapshot | null { return this.saved; }
  get preservesRecords(): boolean { return ['pending', 'cached', 'records'].includes(this.source); }
  get token(): CalendarRequestToken | null {
    if (!this.userId) return null;
    return { userId: this.userId, generation: this.generation, sequence: this.requestSequence };
  }

  activate(userId: string | null): void {
    this.generation++;
    this.requestSequence++;
    this.userId = userId;
    this.saved = null;
    this.persisted = false;
    this.source = userId ? 'pending' : 'builtin';
    if (!userId) return;
    try {
      const raw = this.storage.getItem(calendarSnapshotKey(userId));
      if (!raw) return;
      const value = JSON.parse(raw) as Partial<CalendarScheduleSnapshot>;
      if (!value || value.version !== 1 || value.userId !== userId || typeof value.savedAt !== 'string'
        || !Number.isFinite(Date.parse(value.savedAt))) return;
      const rows = snapshotRows(value.rows);
      if (!rows) return;
      this.saved = { version: 1, userId, savedAt: value.savedAt, rows };
      this.persisted = true;
    } catch { /* Corrupt or unavailable storage must not overwrite a previous record. */ }
  }

  begin(): CalendarRequestToken {
    if (!this.userId) throw new Error('Calendar requires an active account.');
    this.requestSequence++;
    this.source = this.saved ? 'cached' : 'pending';
    return this.token!;
  }

  isCurrent(token: CalendarRequestToken | null): boolean {
    return Boolean(token && token.userId === this.userId && token.generation === this.generation
      && token.sequence === this.requestSequence);
  }

  accept(token: CalendarRequestToken, value: unknown): boolean {
    if (!this.isCurrent(token)) return false;
    const rows = snapshotRows(value);
    if (!rows) throw new Error('Calendar 排程格式不完整，已保留上一次紀錄。');
    const snapshot: CalendarScheduleSnapshot = { version: 1, userId: token.userId, savedAt: this.now(), rows };
    this.saved = snapshot;
    this.source = 'fresh';
    this.persisted = false;
    try {
      this.storage.setItem(calendarSnapshotKey(token.userId), JSON.stringify(snapshot));
      this.persisted = true;
    } catch { /* The in-memory schedule and stored study records remain available. */ }
    return true;
  }

  fail(token: CalendarRequestToken | null): boolean {
    if (!this.isCurrent(token)) return false;
    this.source = this.saved ? 'cached' : 'records';
    this.requestSequence++; // A timed-out request cannot later replace the fallback.
    return true;
  }

  disconnected(token: CalendarRequestToken, preserveRecords = false): boolean {
    if (!this.isCurrent(token)) return false;
    if (this.saved) this.source = 'cached';
    else this.source = preserveRecords ? 'records' : 'builtin';
    return true;
  }

  forget(token: CalendarRequestToken): boolean {
    if (!this.isCurrent(token)) return false;
    this.storage.removeItem(calendarSnapshotKey(token.userId));
    this.saved = null;
    this.persisted = false;
    this.source = 'builtin';
    this.requestSequence++;
    return true;
  }
}
