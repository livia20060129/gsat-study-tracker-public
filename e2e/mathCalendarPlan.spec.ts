import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Taipei' });
const date = '2026-10-29';
const userId = '00000000-0000-0000-0000-000000000090';
const prefix = `study-v11:user:${userId}:`;

async function openMathCalendar(page: Page, manual = false): Promise<void> {
  const cloudRecords = new Map<string, Record<string, unknown>>();
  const parts = manual ? [2] : [1, 2];
  const calendarRows = parts.map(part => ({ event_key: `test:part${part}`, source_event_id: `part${part}`, calendar_id: 'test',
    event_date: date, title: '4A｜條件機率與貝氏定理', category: 'math', event_updated_at: null, metadata: {},
    description: `【講義版本】教學講義 【冊別】4A 【單元進度】條件機率與貝氏定理（${part}/4） 【來源日期】2026/10/${part + 6} 【識別碼】part${part}` }));
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/functions/v1/google-calendar')) return route.fulfill({ json: { connected: true } });
    if (url.pathname.endsWith('/rest/v1/calendar_tasks')) return route.fulfill({ json: calendarRows });
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: { id: userId, aud: 'authenticated', role: 'authenticated' } });
    if (url.pathname.endsWith('/rest/v1/rpc/upsert_study_record')) {
      const body = request.postDataJSON();
      const revision = Number(cloudRecords.get(body.p_study_date)?.revision || 0) + 1;
      const row = { study_date: body.p_study_date, payload: body.p_payload, revision, updated_at: '2026-10-29T04:00:00Z' };
      cloudRecords.set(body.p_study_date, row);
      return route.fulfill({ json: { ...row, applied: true } });
    }
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const requestedDate = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      const rows = [...cloudRecords.values()].filter(row => !requestedDate || row.study_date === requestedDate);
      return route.fulfill({ json: rows });
    }
    return route.fulfill({ json: [] });
  });
  await page.clock.install({ time: new Date('2026-10-29T12:00:00+08:00') });
  await page.goto('/summary.html');
  await page.evaluate(({ date, userId, prefix, parts, manual }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature', refresh_token: 'test-refresh',
      token_type: 'bearer', expires_at: 1_893_456_000, expires_in: 3600, user: { id: userId, aud: 'authenticated', role: 'authenticated' },
    }));
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留今天的筆記', items: parts.map(part => ({
      id: `old-part${part}`, presetKey: `cal_math_part${part}`, templatePresetKey: `cal_math_part${part}`,
      type: 'mathStudy', title: '數學講義：進度', source: 'preset', required: false, done: false, minutes: String(part * 17),
      f: { material: '教學講義', book: '4A', start: manual ? '170' : '', end: manual ? '172' : '',
        calendarEventKey: `test:part${part}`, calendarEventId: `part${part}`,
        ...(manual ? { dailyWorkUserFields: { start: '170', end: '172', book: '4A' } } : {}) },
    })) }));
  }, { date, userId, prefix, parts, manual });
  await page.goto('/');
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
}

async function source(page: Page, part: number) {
  return page.evaluate(({ prefix, date, part }) => {
    const record = JSON.parse(localStorage.getItem(prefix + date)!);
    function visit(items: any[]): any {
      for (const item of items) {
        const children = item.f?.dailyWorkSourceItems;
        if (Array.isArray(children) && children.length) {
          const found = visit(children);
          if (found) return found;
        } else if (item.f?.calendarEventKey === `test:part${part}`) return item;
      }
      return null;
    }
    return { item: visit(record.items), notes: record.notes };
  }, { prefix, date, part });
}

test('October 29 moved math fractions repair blank page fields, merge adjacent ranges and preserve recorded minutes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 900 });
  await openMathCalendar(page);
  const card = page.locator('.item.subject-math').filter({ hasText: '條件機率與貝氏定理' }).first();
  await expect(card.locator('[data-field="book"]').first()).toHaveValue('4A');
  await expect(card.locator('[data-field="start"]').first()).toHaveValue('151');
  await expect(card.locator('[data-field="end"]').first()).toHaveValue('174');
  for (const [part, start, end] of [[1, '151', '162'], [2, '163', '174']] as const) {
    await expect.poll(async () => (await source(page, part)).item?.f.start).toBe(start);
    const saved = await source(page, part);
    expect(saved.item.f.end).toBe(end);
    expect(saved.item.minutes).toBe(String(part * 17));
    expect(saved.item.done).toBe(false);
    expect(saved.notes).toBe('保留今天的筆記');
  }
  await page.reload();
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await expect(card.locator('[data-field="start"]').first()).toHaveValue('151');
  await expect(card.locator('[data-field="end"]').first()).toHaveValue('174');
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('math-fraction-pages-mobile.png') });
  expect(errors).toEqual([]);
});

test('refreshing a moved math fraction preserves deliberate page overrides while updating suggested pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openMathCalendar(page, true);
  const card = page.locator('.item.subject-math').filter({ hasText: '條件機率與貝氏定理' }).first();
  await expect(card.locator('[data-field="start"]')).toHaveValue('170');
  await expect(card.locator('[data-field="end"]')).toHaveValue('172');
  await expect.poll(async () => (await source(page, 2)).item?.f.calendarSuggestedStart).toBe(163);
  const saved = await source(page, 2);
  expect(saved.item.f.calendarSuggestedEnd).toBe(174);
  expect(saved.item.minutes).toBe('34');
  await page.reload();
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await expect(card.locator('[data-field="start"]')).toHaveValue('170');
  await expect(card.locator('[data-field="end"]')).toHaveValue('172');
  expect((await source(page, 2)).notes).toBe('保留今天的筆記');
  expect(errors).toEqual([]);
});
