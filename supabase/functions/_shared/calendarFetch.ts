export const MAX_CALENDAR_SYNC_EVENTS = 25000;

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T12:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calendarSyncWindow(now: number, earliestStored?: string | null): { timeMin: string; timeMax: string; startDate: string; endDate: string } {
  const startDate = ['1970-01-01', ...(validDate(earliestStored) ? [earliestStored] : [])].sort()[0];
  const endDate = new Date(now + 241 * 86400000 + 8 * 3600000).toISOString().slice(0, 10);
  return { startDate, endDate, timeMin: new Date(startDate + 'T00:00:00+08:00').toISOString(),
    timeMax: new Date(endDate + 'T00:00:00+08:00').toISOString() };
}

/** Never return a partial fetch as an authoritative empty/deleted schedule. */
export async function fetchCompleteCalendarEvents<T extends { id: string }>(
  accessToken: string, calendarId: string, earliestStored: string | null = null,
  fetcher: typeof fetch = fetch, now: number = Date.now(), deadline = Date.now() + 240000,
): Promise<{ events: T[]; timeMinDate: string; timeMaxDate: string }> {
  const window = calendarSyncWindow(now, earliestStored);
  const events: T[] = [], tokens = new Set<string>();
  let pageToken = '';
  do {
    if (Date.now() >= deadline) throw new Error('Calendar fetch deadline exceeded');
    if (tokens.size >= 200) throw new Error('Calendar pagination limit exceeded');
    const params = new URLSearchParams({ timeMin: window.timeMin, timeMax: window.timeMax,
      singleEvents: 'true', showDeleted: 'true', maxResults: '2500', timeZone: 'Asia/Taipei' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await fetcher(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(Math.max(1, Math.min(20000, deadline - Date.now()))),
    });
    if (!response.ok) throw new Error(`Google Calendar events.list failed (HTTP ${response.status})`);
    const data = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || (!Array.isArray(data.items) && !(data.kind === 'calendar#events' && data.items === undefined))
      || (data.nextPageToken !== undefined && typeof data.nextPageToken !== 'string')) throw new Error('Invalid Google Calendar events response');
    if (events.length + (data.items?.length || 0) > MAX_CALENDAR_SYNC_EVENTS) throw new Error('Calendar event limit exceeded; previous schedule retained');
    for (const event of data.items || []) {
      if (!event || typeof event.id !== 'string' || !event.id) throw new Error('Google Calendar event ID missing');
      events.push(event);
    }
    pageToken = data.nextPageToken || '';
    if (pageToken && tokens.has(pageToken)) throw new Error('Google Calendar pagination did not advance');
    tokens.add(pageToken);
  } while (pageToken);
  return { events, timeMinDate: window.startDate, timeMaxDate: window.endDate };
}
