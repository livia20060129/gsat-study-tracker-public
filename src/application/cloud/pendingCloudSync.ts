import type { StudyRecord } from '../../types.ts';

export type PendingSyncPhase = 'waiting' | 'queued' | 'uploading' | 'failed' | 'blocked' | 'paused' | 'conflict';
export interface PendingSyncState {
  phase: PendingSyncPhase;
  reason: string;
  attempts: number;
  attemptedAt: number;
  retryAt: number;
}
export interface PendingSyncEntry extends PendingSyncState { date: string }
interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class PendingCloudSync {
  private readonly states = new Map<string, PendingSyncState>();
  private readonly storage: StateStorage;

  constructor(storage: StateStorage) { this.storage = storage; }

  private key(scope: string, date: string): string { return `${scope}meta:pending-sync:${date}`; }

  state(scope: string, date: string): PendingSyncState {
    const key = this.key(scope, date);
    const cached = this.states.get(key);
    if (cached) return { ...cached };
    try {
      const stored = JSON.parse(this.storage.getItem(key) ?? 'null');
      if (stored?.phase === 'paused') return { phase: 'paused', reason: '已由你暫停自動同步。', attempts: 0, attemptedAt: 0, retryAt: 0 };
    } catch { /* UI preferences must not prevent record synchronization. */ }
    return { phase: 'waiting', reason: '本機變更尚未獲得雲端確認。', attempts: 0, attemptedAt: 0, retryAt: 0 };
  }

  private set(scope: string, date: string, state: PendingSyncState): void {
    this.states.set(this.key(scope, date), state);
  }

  queued(scope: string, date: string): void {
    this.set(scope, date, { ...this.state(scope, date), phase: 'queued' });
  }

  started(scope: string, date: string, now = Date.now()): void {
    this.set(scope, date, { ...this.state(scope, date), phase: 'uploading', attemptedAt: now });
  }

  failed(scope: string, date: string, reason: string, blocked = false, now = Date.now()): void {
    const previous = this.state(scope, date);
    const attempts = previous.attempts + 1;
    this.set(scope, date, { phase: blocked ? 'blocked' : 'failed', reason, attempts,
      attemptedAt: now, retryAt: now + Math.min(60_000, 2_000 * 2 ** Math.min(attempts - 1, 5)) });
  }

  saved(scope: string, date: string): void {
    this.states.delete(this.key(scope, date));
    try { this.storage.removeItem(this.key(scope, date)); } catch { /* Confirmed data remains saved. */ }
  }

  pause(scope: string, date: string): void {
    this.set(scope, date, { ...this.state(scope, date), phase: 'paused', reason: '已由你暫停自動同步。' });
    try { this.storage.setItem(this.key(scope, date), JSON.stringify({ phase: 'paused' })); } catch { /* Keep the current-page choice. */ }
  }

  resume(scope: string, date: string): void { this.saved(scope, date); }

  resetActivity(scope: string): void {
    for (const [key, state] of this.states) {
      if (key.startsWith(scope) && (state.phase === 'queued' || state.phase === 'uploading')) {
        this.states.set(key, { ...state, phase: 'waiting' });
      }
    }
  }

  ready(scope: string, record: StudyRecord, now = Date.now()): boolean {
    if (!record.localDirty || record.syncConflict || record.storageIssue) return false;
    const state = this.state(scope, record.date);
    return (state.phase === 'waiting' || state.phase === 'failed') && state.retryAt <= now;
  }

  entries(scope: string, records: readonly StudyRecord[]): PendingSyncEntry[] {
    return records.filter(record => record.localDirty || record.syncConflict).map(record => {
      const state = this.state(scope, record.date);
      if (record.syncConflict) return { ...state, date: record.date, phase: 'conflict' as const, reason: '兩端同一欄位有不同修改，需要比較版本後處理。' };
      return { ...state, date: record.date };
    }).sort((left, right) => left.date.localeCompare(right.date));
  }
}
