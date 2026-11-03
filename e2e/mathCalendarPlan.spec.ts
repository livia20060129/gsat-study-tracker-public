import { selectStudyDate } from './helpers/siteNavigation.ts';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Taipei' });
const date = '2026-10-29';
const userId = '00000000-0000-0000-0000-000000000090';
const prefix = `study-v11:user:${userId}:`;

async function openMathCalendar(page: Page, manual = false, scenario: 'conditional' | 'triangle' | 'unresolved' = 'conditional'): Promise<void> {
  const cloudRecords = new Map<string, Record<string, unknown>>();
  const recordDate = scenario === 'conditional' ? date : '2026-11-02';
  let parts = manual ? [2] : [1, 2];
  let book = '4A', topic = '條件機率與貝氏定理', total = 4;
  let recordedStart = manual ? '170' : '', recordedEnd = manual ? '172' : '';
  if (scenario !== 'conditional') {
    parts = manual ? [3] : [2, 3];
    book = '2'; topic = '三角比'; total = 5;
    recordedStart = manual ? '240' : ''; recordedEnd = manual ? '243' : '';
  }
  if (scenario === 'unresolved') {
    parts = [2]; recordedStart = '228'; recordedEnd = '236';
  }
  const calendarRows = parts.map(function calendarRow(part) {
    const sourceDay = scenario === 'conditional' ? part + 6 : part + 11;
    const source = scenario === 'unresolved' ? '' : `【來源日期】2026/10/${sourceDay}`;
    return { event_key: `test:part${part}`, source_event_id: `part${part}`, calendar_id: 'test',
      event_date: recordDate, title: `${book}｜${topic}`, category: 'math', event_updated_at: null, metadata: {},
      description: `【講義版本】教學講義 【冊別】${book} 【單元進度】${topic}（${part}/${total}） ${source} 【識別碼】part${part}` };
  });
  await page.context().route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', async route => {
    const request = route.request();
    const requestHeaders = await request.allHeaders();
    const url = new URL(request.url());
    const headers = {
      'Access-Control-Allow-Origin': requestHeaders.origin || 'http://127.0.0.1:4173',
      'Access-Control-Allow-Headers': requestHeaders['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info,x-supabase-api-version,x-supabase-client-platform,x-supabase-client-platform-version,x-supabase-client-runtime,x-supabase-client-runtime-version',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/functions/v1/google-calendar')) return route.fulfill({ json: { connected: true }, headers });
    if (url.pathname.endsWith('/rest/v1/calendar_tasks')) return route.fulfill({ json: calendarRows, headers });
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: { id: userId, aud: 'authenticated', role: 'authenticated' }, headers });
    if (url.pathname.endsWith('/rest/v1/rpc/upsert_study_record')) {
      const body = request.postDataJSON();
      const revision = Number(cloudRecords.get(body.p_study_date)?.revision || 0) + 1;
      const row = { study_date: body.p_study_date, payload: body.p_payload, revision, updated_at: '2026-10-29T04:00:00Z' };
      cloudRecords.set(body.p_study_date, row);
      return route.fulfill({ json: { ...row, applied: true }, headers });
    }
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const requestedDate = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      const rows = [...cloudRecords.values()].filter(row => !requestedDate || row.study_date === requestedDate);
      return route.fulfill({ json: rows, headers });
    }
    return route.fulfill({ json: [], headers });
  });
  await page.clock.install({ time: new Date(`${recordDate}T12:00:00+08:00`) });
  await page.goto('/summary.html');
  await page.evaluate(({ date, userId, prefix, parts, manual, scenario, book, recordedStart, recordedEnd }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify({
      access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature', refresh_token: 'test-refresh',
      token_type: 'bearer', expires_at: 1_893_456_000, expires_in: 3600, user: { id: userId, aud: 'authenticated', role: 'authenticated' },
    }));
    localStorage.setItem(prefix + date, JSON.stringify({ schemaVersion: 2, date, notes: '保留今天的筆記', items: parts.map(part => ({
      id: `old-part${part}`, presetKey: `cal_math_part${part}`, templatePresetKey: `cal_math_part${part}`,
      type: 'mathStudy', title: '數學講義：進度', source: 'preset', required: false, done: false, minutes: String(part * 17),
      f: { material: '教學講義', book, start: recordedStart, end: recordedEnd,
        calendarEventKey: `test:part${part}`, calendarEventId: `part${part}`,
        ...(scenario === 'unresolved' ? { calendarSuggestedStart: 228, calendarSuggestedEnd: 236, calendarDailyPages: 9 } : {}),
        ...(manual ? { dailyWorkUserFields: { start: recordedStart, end: recordedEnd, book } } : {}) },
    })) }));
  }, { date: recordDate, userId, prefix, parts, manual, scenario, book, recordedStart, recordedEnd });
  await page.goto('/');
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
}

async function source(page: Page, part: number, recordDate = date) {
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
  }, { prefix, date: recordDate, part });
}

test('October 29 moved math fractions repair blank page fields, merge adjacent ranges and preserve recorded minutes', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 900 });
  await openMathCalendar(page);
  const card = page.locator('.item.subject-math').filter({ has: page.locator('[data-field="book"] option[value="4A"]:checked') }).first();
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
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
  await page.reload();
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
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
  const card = page.locator('.item.subject-math').filter({ has: page.locator('[data-field="book"] option[value="4A"]:checked') }).first();
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

test('November 2 triangle source dates repair 2/5 and 3/5 ranges on desktop/mobile and retain saves after navigation', async ({ page }, testInfo) => {
  const recordDate = '2026-11-02';
  await openMathCalendar(page, false, 'triangle');
  const card = page.locator('.item.subject-math').filter({ has: page.locator('[data-field="book"] option[value="2"]:checked') }).first();
  for (const width of [1280, 375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(card.locator('[data-field="start"]').first()).toHaveValue('228');
    await expect(card.locator('[data-field="end"]').first()).toHaveValue('245');
    await expect(card.locator('[data-field="start"]').first()).toBeEditable();
    await expect(card.locator('[data-field="end"]').first()).toBeEditable();
    await expect(card.locator('[data-math-auto]').first()).not.toHaveText('尚無對應資料');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await card.screenshot({ path: testInfo.outputPath(`triangle-restored-${width}.png`) });
  }
  for (const [part, start, end] of [[2, '228', '236'], [3, '237', '245']] as const) {
    await expect.poll(async () => (await source(page, part, recordDate)).item?.f.start).toBe(start);
    const saved = await source(page, part, recordDate);
    expect(saved.item.f.end).toBe(end);
    expect(saved.item.minutes).toBe(String(part * 17));
    expect(saved.notes).toBe('保留今天的筆記');
  }
  await card.locator('[data-done]').first().check();
  await selectStudyDate(page, '2026-11-03');
  await selectStudyDate(page, recordDate);
  await page.reload();
  await expect(card.locator('[data-field="start"]').first()).toHaveValue('228');
  await expect(card.locator('[data-field="end"]').first()).toHaveValue('245');
  await expect(card.locator('[data-done]').first()).toBeChecked();
});

test('revised triangle source-date resolution keeps manually edited pages and updates suggestions', async ({ page }) => {
  await openMathCalendar(page, true, 'triangle');
  const card = page.locator('.item.subject-math').filter({ has: page.locator('[data-field="book"] option[value="2"]:checked') }).first();
  await expect(card.locator('[data-field="start"]')).toHaveValue('240');
  await expect(card.locator('[data-field="end"]')).toHaveValue('243');
  await expect.poll(async () => (await source(page, 3, '2026-11-02')).item?.f.calendarSuggestedStart).toBe(237);
  expect((await source(page, 3, '2026-11-02')).item.f.calendarSuggestedEnd).toBe(245);
  await page.reload();
  await expect(card.locator('[data-field="start"]')).toHaveValue('240');
  await expect(card.locator('[data-field="end"]')).toHaveValue('243');
});

test('an unresolved Calendar refresh keeps the last saved math pages and minutes instead of replacing them with blanks', async ({ page }) => {
  await openMathCalendar(page, false, 'unresolved');
  for (let attempt = 0; attempt < 2; attempt++) {
    await expect.poll(async () => (await source(page, 2, '2026-11-02')).item?.f.start).toBe('228');
    const saved = await source(page, 2, '2026-11-02');
    expect(saved.item.f.end).toBe('236');
    expect(saved.item.f.calendarSuggestedStart).toBe(228);
    expect(saved.item.minutes).toBe('34');
    await page.reload();
    await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  }
});
