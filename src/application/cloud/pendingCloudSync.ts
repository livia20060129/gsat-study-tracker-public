import type { StudyRecord } from '../../types.ts';
import { isUnrecordedCalendarCache } from '../../study/recordedActivity.ts';

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
      if (stored?.phase === 'paused') return { phase: 'paused', reason: '已由你暫停此日同步。', attempts: 0, attemptedAt: 0, retryAt: 0 };
      if (['failed','blocked','waiting'].includes(stored?.phase) && typeof stored.reason === 'string' && stored.reason.trim()) {
        // Reload permits one normal load-triggered attempt, while retaining the
        // last actual cause until that attempt starts or the user retries.
        return { phase:'waiting', reason:`上次未完成原因：${stored.reason.slice(0,1000)}`,
          attempts:Number.isSafeInteger(stored.attempts) && stored.attempts>0 ? stored.attempts : 0,
          attemptedAt:Number.isFinite(stored.attemptedAt) && stored.attemptedAt>0 ? stored.attemptedAt : 0, retryAt:0 };
      }
    } catch { /* UI preferences must not prevent record synchronization. */ }
    return { phase: 'waiting', reason: '本機變更尚未獲得雲端確認。', attempts: 0, attemptedAt: 0, retryAt: 0 };
  }

  private set(scope: string, date: string, state: PendingSyncState): void {
    this.states.set(this.key(scope, date), state);
    if (state.phase==='failed' || state.phase==='blocked' || state.phase==='waiting') {
      try { this.storage.setItem(this.key(scope,date),JSON.stringify({...state,reason:state.reason.slice(0,1000)})); }
      catch { /* Failed diagnostics must never replace or delete an actual record. */ }
    }
  }

  queued(scope: string, date: string): void {
    this.set(scope, date, { ...this.state(scope, date), phase: 'queued' });
  }

  started(scope: string, date: string, now = Date.now()): void {
    this.set(scope, date, { ...this.state(scope, date), phase: 'uploading', attemptedAt: now });
  }

  waiting(scope: string, date: string, reason: string): void {
    this.set(scope, date, { ...this.state(scope, date), phase: 'waiting', reason, retryAt: 0 });
  }

  failed(scope: string, date: string, reason: string, blocked = false, now = Date.now()): void {
    const previous = this.state(scope, date);
    const attempts = previous.attempts + 1;
    this.set(scope, date, { phase: blocked ? 'blocked' : 'failed', reason, attempts,
      attemptedAt: now, retryAt: 0 });
  }

  saved(scope: string, date: string): void {
    this.states.delete(this.key(scope, date));
    try { this.storage.removeItem(this.key(scope, date)); } catch { /* Confirmed data remains saved. */ }
  }

  pause(scope: string, date: string): void {
    this.set(scope, date, { ...this.state(scope, date), phase: 'paused', reason: '已由你暫停此日同步。' });
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

  ready(scope: string, record: StudyRecord): boolean {
    if (!record.localDirty || record.syncConflict || record.storageIssue || isUnrecordedCalendarCache(record)) return false;
    const state = this.state(scope, record.date);
    return state.phase === 'waiting';
  }

  entries(scope: string, records: readonly StudyRecord[]): PendingSyncEntry[] {
    return records.filter(record => (record.localDirty || record.syncConflict) && !isUnrecordedCalendarCache(record)).map(record => {
      const state = this.state(scope, record.date);
      if (record.syncConflict) return { ...state, date: record.date, phase: 'conflict' as const, reason: '兩端同一欄位有不同修改，需要比較版本後處理。' };
      return { ...state, date: record.date };
    }).sort((left, right) => left.date.localeCompare(right.date));
  }
}
