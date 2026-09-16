interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}

interface SupabaseResult<T> {
  data: T;
  error: SupabaseErrorLike | null;
}

interface CalendarTaskQuery extends PromiseLike<SupabaseResult<unknown>> {
  eq(column: string, value: string): CalendarTaskQuery;
  or(filters: string): CalendarTaskQuery;
  order(column: string, options: { ascending: boolean }): CalendarTaskQuery;
  limit(count: number): CalendarTaskQuery;
}

export interface SupabaseCalendarTaskClient {
  from(table: string): { select(columns: string): CalendarTaskQuery };
}

export interface CalendarTaskRow {
  event_key: string;
  source_event_id: string;
  calendar_id: string;
  event_date: string;
  title: string;
  description: string;
  category: string;
  event_updated_at: string | null;
  metadata: unknown;
}

interface CalendarTaskCursor {
  eventDate: string;
  eventKey: string;
}

export const CALENDAR_TASK_PAGE_SIZE = 500;

const CALENDAR_TASK_COLUMNS = [
  'event_key',
  'source_event_id',
  'calendar_id',
  'event_date',
  'title',
  'description',
  'category',
  'event_updated_at',
  'metadata',
].join(',');

function errorMessage(error: SupabaseErrorLike): string {
  return [error.message, error.details, error.hint, error.code].filter(Boolean).join('｜') || 'Supabase request failed.';
}

function postgrestQuoted(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function cursorFromRow(value: unknown): CalendarTaskCursor | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Partial<CalendarTaskRow>;
  const eventDate = String(row.event_date ?? '').trim();
  const eventKey = String(row.event_key ?? '').trim();
  if (!eventDate || !eventKey) return null;
  return { eventDate, eventKey };
}

function rowFrom(value: unknown): CalendarTaskRow | null {
  const cursor = cursorFromRow(value);
  if (!cursor || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as CalendarTaskRow;
}

function afterCalendarTaskCursor(cursor: CalendarTaskCursor): string {
  const eventKey = postgrestQuoted(cursor.eventKey);
  return [
    `event_date.gt.${cursor.eventDate}`,
    `and(event_date.eq.${cursor.eventDate},event_key.gt.${eventKey})`,
  ].join(',');
}

/** Reads every visible calendar task with stable keyset pagination. */
export async function loadAllCalendarTaskRows(
  client: SupabaseCalendarTaskClient,
  userId: string,
): Promise<CalendarTaskRow[]> {
  const rows: CalendarTaskRow[] = [];
  let cursor: CalendarTaskCursor | null = null;

  while (true) {
    let query = client.from('calendar_tasks').select(CALENDAR_TASK_COLUMNS).eq('user_id', userId);
    if (cursor) query = query.or(afterCalendarTaskCursor(cursor));
    query = query
      .order('event_date', { ascending: true })
      .order('event_key', { ascending: true })
      .limit(CALENDAR_TASK_PAGE_SIZE);

    const result = await query;
    if (result.error) throw new Error(errorMessage(result.error));
    const page = Array.isArray(result.data) ? result.data : [];
    rows.push(...page.map(rowFrom).filter((row): row is CalendarTaskRow => row !== null));

    if (page.length < CALENDAR_TASK_PAGE_SIZE) break;
    const nextCursor = cursorFromRow(page[page.length - 1]);
    if (!nextCursor) {
      throw new Error('Calendar 資料缺少分頁所需的 event_date 或 event_key，已停止讀取以避免漏資料。');
    }
    if (cursor && cursor.eventDate === nextCursor.eventDate && cursor.eventKey === nextCursor.eventKey) {
      throw new Error('Calendar 分頁游標沒有前進，已停止讀取以避免無限重試。');
    }
    cursor = nextCursor;
  }

  return rows;
}
