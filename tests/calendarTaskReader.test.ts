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
