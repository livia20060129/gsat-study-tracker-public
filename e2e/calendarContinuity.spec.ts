import { selectStudyDate } from './helpers/siteNavigation.ts';
import { expect, test } from '@playwright/test';
import type { Page, Route } from '@playwright/test';

// Calendar persistence does not depend on animation frames; tracker.spec.ts covers motion separately.
test.use({ timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
const date = '2026-10-29';
const userA = '00000000-0000-0000-0000-000000000031';
const userB = '00000000-0000-0000-0000-000000000032';
const prefix = (user: string) => 'study-v11:user:' + user + ':';
const snapshotKey = (user: string) => 'study-v11:calendar-snapshot:' + user;
const calendarRow = { event_key: 'test:continuity', source_event_id: 'continuity', calendar_id: 'test', event_date: date,
  title: '4A｜條件機率與貝氏定理', category: 'math', event_updated_at: null, metadata: {},
  description: '【講義版本】教學講義 【冊別】4A 【單元進度】條件機率與貝氏定理（1/4） 【來源日期】2026/10/07 【識別碼】continuity' };
type State = { user: string; status: 'ok' | 'fail' | 'hold'; table: 'ok' | 'bad' | 'empty'; syncFails: boolean; held?: Route };

function session(user: string) {
  return { access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: user, role: 'authenticated' })) + '.signature',
    refresh_token: 'test-refresh', token_type: 'bearer', expires_at: 1_893_456_000, expires_in: 3600,
    user: { id: user, email: user === userA ? 'a@example.test' : 'b@example.test', aud: 'authenticated', role: 'authenticated' } };
}
function previousRecord(label: string) {
  return { schemaVersion: 2, date, notes: '保留筆記', items: [{ id: label, type: 'general', title: label, source: 'preset',
    presetKey: 'cal_previous', required: true, done: true, checkedOn: date, minutes: '37',
    f: { subject: '英文', calendarEventKey: 'previous:' + label, start: '5', end: '8' } }] };
}

async function setup(page: Page, state: State, record?: ReturnType<typeof previousRecord>, clockMode: 'fixed' | 'controlled' = 'fixed'): Promise<void> {
  const cloud = new Map<string, Record<string, unknown>>();
  if (record) cloud.set(state.user + ':' + date, { study_date: date, payload: record, revision: 1, updated_at: '2026-10-29T03:00:00Z' });
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const headers = { 'Access-Control-Allow-Origin': request.headers().origin || '*',
      'Access-Control-Allow-Headers': request.headers()['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: session(state.user).user, headers });
    if (url.pathname.endsWith('/functions/v1/google-calendar')) {
      const action = request.postDataJSON()?.action;
      if (action === 'status' && state.status === 'hold') { state.held = route; return; }
      if ((action === 'status' && state.status === 'fail') || (action === 'sync' && state.syncFails)) {
        return route.fulfill({ status: 503, json: { error: 'isolated Calendar unavailable' }, headers });
      }
      return route.fulfill({ json: { connected: true, synced: 1 }, headers });
    }
    if (url.pathname.endsWith('/rest/v1/calendar_tasks')) {
      let rows: unknown = [calendarRow];
      if (state.table === 'bad') rows = { unavailable: true };
      if (state.table === 'empty') rows = [];
      return route.fulfill({ json: rows, headers });
    }
    if (url.pathname.endsWith('/rest/v1/rpc/upsert_study_record')) {
      const body = request.postDataJSON(), key = state.user + ':' + body.p_study_date;
      const row = { study_date: body.p_study_date, payload: body.p_payload,
        revision: Number(cloud.get(key)?.revision || 0) + 1, updated_at: '2026-10-29T04:00:00Z' };
      cloud.set(key, row);
      return route.fulfill({ json: { ...row, applied: true }, headers });
    }
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const requested = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      const rows = [...cloud.entries()].filter(([key, row]) => key.startsWith(state.user + ':') && (!requested || row.study_date === requested)).map(([, row]) => row);
      return route.fulfill({ json: rows, headers });
    }
    return route.fulfill({ json: [], headers });
  });
  const time = new Date('2026-10-29T12:00:00+08:00');
  if (clockMode === 'controlled') await page.clock.install({ time });
  else await page.clock.setFixedTime(time);
  await page.goto('/summary.html');
  await page.evaluate(({ user, session, record, date }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:user:' + user + ':');
    localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify(session));
    localStorage.setItem('study-v11:user:' + user + ':' + date, JSON.stringify(record || { schemaVersion: 2, date, notes: '保留筆記', items: [] }));
  }, { user: state.user, session: session(state.user), record, date });
  await page.goto('/');
}

async function openSettings(page: Page): Promise<void> {
  const panel = page.locator('#connectionSettings');
  if (!await panel.evaluate(node => (node as HTMLDetailsElement).open)) {
    await panel.locator('.connection-settings-toggle').click();
  }
  await expect(panel).toHaveAttribute('open', '');
  await expect(panel).not.toHaveClass(/\bis-(opening|closing)\b/);
  await expect(page.locator('#calendarSyncBtn')).toBeVisible();
}
async function cached(page: Page, user = userA): Promise<string | null> {
  return page.evaluate(key => localStorage.getItem(key), snapshotKey(user));
}

test('sync/status errors keep same-account items, completion, ranges and minutes across reload and date navigation', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 900 });
  const state: State = { user: userA, status: 'ok', table: 'ok', syncFails: false };
  await setup(page, state);
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  await expect(page.locator('#calendarStatusBadge [data-ui-icon="globe-check"] svg')).toBeVisible();
  const card = page.locator('.item.subject-math').filter({ has: page.locator('[data-field="book"] option[value="4A"]:checked') }).first();
  await card.locator('[data-minutes]').first().fill('33');
  await card.locator('[data-minutes]').first().blur();
  await card.locator('[data-done]').first().check();
  const snapshot = await cached(page);
  expect(snapshot).not.toBeNull();
  state.syncFails = true;
  // Keep Save at the summary's click point regardless of the runner's font metrics.
  await page.addStyleTag({ content: '#connectionSettings > summary { position: relative; } #saveBtn { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); }' });
  const summary = page.locator('#connectionSettings > summary');
  await summary.scrollIntoViewIfNeeded();
  expect(await summary.evaluate(node => {
    const rect = node.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button')?.id;
  })).toBe('saveBtn');
  await page.locator('#saveBtn').evaluate(button => {
    button.addEventListener('click', () => button.setAttribute('data-test-save-clicked', 'true'));
  });
  await openSettings(page); await page.locator('#calendarSyncBtn').click();
  await expect(page.locator('#saveBtn')).not.toHaveAttribute('data-test-save-clicked', 'true');
  await expect(page.locator('#calendarMessage')).toContainText('已儲存的項目');
  await expect(page.locator('#calendarStatusBadge [data-ui-icon="globe-x"] svg')).toBeVisible();
  await expect(card.locator('[data-done]').first()).toBeChecked();
  await expect(card.locator('[data-minutes]').first()).toHaveValue('33');
  state.status = 'fail';
  await page.reload();
  await expect(page.locator('#calendarStatusBadge')).toContainText('同步異常');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('calendar-fallback-mobile.png') });
  await expect(card.locator('[data-done]').first()).toBeChecked();
  await expect(card.locator('[data-field="start"]').first()).toHaveValue('151');
  await expect(card.locator('[data-field="end"]').first()).toHaveValue('162');
  await expect(card.locator('[data-minutes]').first()).toHaveValue('33');
  await selectStudyDate(page, '2026-10-30');
  await selectStudyDate(page, date);
  await expect(card.locator('[data-done]').first()).toBeChecked();
  expect(await cached(page)).toBe(snapshot);
});

test('without a snapshot a failed connection preserves the last saved account record and adds no built-in replacements', async ({ page }) => {
  const state: State = { user: userA, status: 'fail', table: 'ok', syncFails: true };
  await setup(page, state, previousRecord('A 上次保存項目'));
  await expect(page.locator('#calendarMessage')).toContainText('已儲存的項目');
  await expect(page.locator('#dailyItemList')).toContainText('A 上次保存項目');
  const record = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), prefix(userA) + date);
  expect(record.items.map((item: { id: string }) => item.id)).toEqual(['A 上次保存項目']);
  expect(record.items[0]).toEqual(expect.objectContaining({ done: true, minutes: '37', checkedOn: date }));
  expect(record.notes).toBe('保留筆記');
  expect(await cached(page)).toBeNull();
});

test('public Calendar failure never rebuilds a missing day from an old schedule snapshot', async ({ page }) => {
  const state: State = { user: userA, status: 'fail', table: 'ok', syncFails: true };
  await setup(page, state);
  await page.evaluate(({ key, row, userId }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, userId, savedAt: '2026-10-28T04:00:00Z', rows: [row] }));
  }, { key: snapshotKey(userA), row: calendarRow, userId: userA });
  await page.reload();
  await expect(page.locator('#calendarStatusBadge')).toContainText('同步異常');
  await expect(page.locator('#dailyItemList .item')).toHaveCount(0);
  await expect(page.locator('#calendarMessage')).toContainText('已儲存的項目');
});

test('an account cannot reuse another account snapshot or guest records after a login change', async ({ page }) => {
  const state: State = { user: userA, status: 'ok', table: 'ok', syncFails: false };
  await setup(page, state);
  await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  const aSnapshot = await cached(page);
  await page.goto('/summary.html');
  state.user = userB; state.status = 'fail';
  await page.evaluate(async ({ session, record, date }) => {
    localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify(session));
    localStorage.setItem('study-v11:meta:active-record-prefix', 'study-v11:user:' + session.user.id + ':');
    localStorage.setItem('study-v11:user:' + session.user.id + ':' + date, JSON.stringify(record));
    // Update the canonical auth store too when simulating an account switch.
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('gsat-study-tracker-auth', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result, transaction = database.transaction('sessions', 'readwrite');
        transaction.objectStore('sessions').put({ value: JSON.stringify(session) }, 'sb-xcpnxkkixsxzgbqsiuud-auth-token');
        transaction.oncomplete = () => { database.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, { session: session(userB), record: previousRecord('B 上次保存項目'), date });
  await page.goto('/');
  await expect(page.locator('#calendarMessage')).toContainText('已儲存的項目');
  await expect(page.locator('#dailyItemList')).toContainText('B 上次保存項目');
  await expect(page.locator('#dailyItemList')).not.toContainText('條件機率與貝氏定理');
  expect(await cached(page, userA)).toBe(aSnapshot);
  expect(await cached(page, userB)).toBeNull();
});

test('malformed task responses retain the snapshot while a genuine successful empty result replaces it', async ({ page }) => {
  const state: State = { user: userA, status: 'ok', table: 'ok', syncFails: false };
  await setup(page, state); await expect(page.locator('#calendarStatusBadge')).toHaveText('已連接');
  const snapshot = await cached(page);
  state.table = 'bad';
  await openSettings(page); await page.locator('#calendarSyncBtn').click();
  await expect(page.locator('#calendarMessage')).toContainText('已儲存的項目');
  expect(await cached(page)).toBe(snapshot);
  state.table = 'empty';
  await page.locator('#calendarSyncBtn').click();
  await expect(page.locator('#calendarMessage')).toContainText('同步完成');
  expect(JSON.parse((await cached(page))!).rows).toEqual([]);
  state.status = 'fail'; await page.reload();
  await expect(page.locator('#calendarStatusBadge')).toContainText('同步異常');
  expect(JSON.parse((await cached(page))!).rows).toEqual([]);
});

test('a late status response after the bootstrap timeout cannot apply or persist a new schedule', async ({ page }) => {
  const state: State = { user: userA, status: 'hold', table: 'ok', syncFails: false };
  await setup(page, state, previousRecord('逾時保留項目'), 'controlled');
  await expect.poll(() => Boolean(state.held)).toBe(true);
  await expect(page.locator('#calendarStatusBadge [data-ui-icon="globe"] svg')).toBeVisible();
  await page.clock.fastForward(16_000);
  await expect(page.locator('#calendarMessage')).toContainText('已儲存的項目');
  const held = state.held!;
  await held.fulfill({ json: { connected: true }, headers: { 'Access-Control-Allow-Origin': '*' } });
  await expect(page.locator('#calendarStatusBadge')).toContainText('同步異常');
  await expect(page.locator('#dailyItemList')).toContainText('逾時保留項目');
  expect(await cached(page)).toBeNull();
});
