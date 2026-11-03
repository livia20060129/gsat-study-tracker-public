import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CALENDAR_TASK_PAGE_SIZE,
  loadAllCalendarTaskRows,
  type SupabaseCalendarTaskClient,
} from '../src/infrastructure/storage/supabaseCalendarTaskReader.ts';

const calendarRow = (index: number) => ({
  event_key: `primary:event-${String(index).padStart(4, '0')}`,
  source_event_id: `event-${index}`,
  calendar_id: 'primary',
  event_date: `2026-09-${String(Math.floor(index / 100) + 1).padStart(2, '0')}`,
  title: `item ${index}`,
  description: '',
  category: 'other',
  event_updated_at: null,
  metadata: {},
});

test('Calendar task reader loads more than one Data API page without truncation', async () => {
  const rows = Array.from({ length: CALENDAR_TASK_PAGE_SIZE + 3 }, (_, index) => calendarRow(index));
  const pages = [rows.slice(0, CALENDAR_TASK_PAGE_SIZE), rows.slice(CALENDAR_TASK_PAGE_SIZE)];
  const filters: string[] = [];
  let requestIndex = 0;
  const client = {
    from(table: string) {
      assert.equal(table, 'calendar_tasks');
      return {
        select() {
          const page = pages[requestIndex++] ?? [];
          return {
            eq() { return this; },
            or(value: string) { filters.push(value); return this; },
            order() { return this; },
            limit() { return Promise.resolve({ data: page, error: null }); },
          };
        },
      };
    },
  } as unknown as SupabaseCalendarTaskClient;

  const loaded = await loadAllCalendarTaskRows(client, 'user-a');
  assert.equal(loaded.length, CALENDAR_TASK_PAGE_SIZE + 3);
  assert.equal(requestIndex, 2);
  assert.equal(filters.length, 1);
  assert.match(filters[0], /event_date\.gt\./);
  assert.match(filters[0], /event_key\.gt\./);
});

test('Calendar task reader fails closed when any later page fails', async () => {
  const fullPage = Array.from({ length: CALENDAR_TASK_PAGE_SIZE }, (_, index) => calendarRow(index));
  let requestIndex = 0;
  const client = {
    from() {
      return {
        select() {
          const current = requestIndex++;
          return {
            eq() { return this; },
            or() { return this; },
            order() { return this; },
            limit() {
              return Promise.resolve(current === 0
                ? { data: fullPage, error: null }
                : { data: null, error: { message: 'calendar page failed' } });
            },
          };
        },
      };
    },
  } as unknown as SupabaseCalendarTaskClient;

  await assert.rejects(() => loadAllCalendarTaskRows(client, 'user-a'), /calendar page failed/);
  assert.equal(requestIndex, 2);
});

function clientReturning(data: unknown): SupabaseCalendarTaskClient {
  return { from() { return { select() { return {
    eq() { return this; }, or() { return this; }, order() { return this; },
    limit() { return Promise.resolve({ data, error: null }); },
  }; } }; } } as unknown as SupabaseCalendarTaskClient;
}

test('non-array responses are errors rather than an authoritative empty schedule', async () => {
  for (const value of [null, {}, { error: 'unavailable' }]) {
    await assert.rejects(loadAllCalendarTaskRows(clientReturning(value), 'a'), /回應格式不完整/);
  }
  assert.deepEqual(await loadAllCalendarTaskRows(clientReturning([]), 'a'), []);
});

test('a malformed row cannot silently turn a partially read schedule into a successful deletion', async () => {
  await assert.rejects(loadAllCalendarTaskRows(clientReturning([calendarRow(0), { title: 'missing keys' }]), 'a'), /缺少識別碼或日期/);
});
