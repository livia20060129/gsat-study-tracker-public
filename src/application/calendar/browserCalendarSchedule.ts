import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../../config/supabase.ts';
import { initialRecordPrefix } from '../../storage/local.ts';
import { browserAuthPersistence, createPersistentAuthStorage } from '../../infrastructure/storage/browserAuthStorage.ts';
import { fetchAllCalendarTaskRows } from '../../infrastructure/storage/supabaseCalendarTaskReader.ts';
import { CalendarScheduleContinuity } from './calendarScheduleContinuity.ts';
import { synchronizeStoredCalendarSchedule } from './storedCalendarSchedule.ts';

export const CALENDAR_SCHEDULE_UPDATED = 'study-calendar-schedule-updated';
let pending: Promise<void> | null = null;

function todayKey(): string {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** Standalone pages only read the existing login. They never create a session or call Google sync. */
export async function refreshBrowserCalendarSchedule(): Promise<void> {
  if (pending) return pending;
  pending = refresh();
  try { await pending; } finally { pending = null; }
}

async function refresh(): Promise<void> {
  const prefix = initialRecordPrefix(localStorage);
  const match = /^study-v11:user:([^:]+):$/.exec(prefix);
  if (!match || navigator.onLine === false) return;
  const userId = match[1];
  try {
    const auth = createPersistentAuthStorage(browserAuthPersistence(window.indexedDB), localStorage);
    const raw = await auth.getItem(`sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`);
    const session = raw ? JSON.parse(raw) : null;
    if (!session?.access_token || session.user?.id !== userId) return;
    const headers = { authorization: `Bearer ${session.access_token}`, apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
    async function status(): Promise<{ userId?: string; connected?: boolean; sync_error?: string | null; last_synced_at?: string | null }> {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/google-calendar`, { method: 'POST', headers,
        body: JSON.stringify({ action: 'status' }), signal: AbortSignal.timeout(10000), cache: 'no-store' });
      if (!response.ok) throw new Error('Calendar 連線狀態暫時無法確認。');
      const value = await response.json();
      if (value.userId !== userId || !value.connected || value.sync_error || !value.last_synced_at) throw new Error('Calendar 上一次同步尚未成功，保留既有紀錄。');
      return value;
    }
    const before = await status();
    const rows = (await fetchAllCalendarTaskRows(SUPABASE_URL, userId, headers)).map(function schedulingFields({ metadata, ...row }) { return row; });
    const after = await status();
    if (before.last_synced_at !== after.last_synced_at || initialRecordPrefix(localStorage) !== prefix) return;
    const continuity = new CalendarScheduleContinuity(localStorage);
    continuity.activate(userId);
    const token = continuity.begin();
    if (!continuity.accept(token, rows)) return;
    const result = synchronizeStoredCalendarSchedule(localStorage, prefix, rows, todayKey());
    window.dispatchEvent(new CustomEvent(CALENDAR_SCHEDULE_UPDATED, { detail: result }));
  } catch {
    // Failed/partial snapshots, expired logins and offline mode leave all previous records intact.
  }
}

export function initializeBrowserCalendarSchedule(): void {
  void refreshBrowserCalendarSchedule();
  window.addEventListener('pageshow', event => { if (event.persisted) void refreshBrowserCalendarSchedule(); });
}
