import { expect, test, type Page, type Route } from '@playwright/test';
import { recordSyncWatermarkKey } from '../src/storage/syncWatermark.ts';
import type { StudyRecord } from '../src/types.ts';

test.use({ timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
const today = '2026-08-09';
const user = { id: '00000000-0000-0000-0000-000000000124', email: 'pending@example.test', role: 'authenticated', aud: 'authenticated' };
const prefix = `study-v11:user:${user.id}:`;
const oldDate = '2026-08-03';
interface CloudRow { study_date: string; payload: StudyRecord; revision: number; updated_at: string }
interface State { rows: Map<string, CloudRow>; posts: Map<string, number>; failures: Map<string, number>; held: Route[]; holdReads: boolean; beforeSaveReply?: () => Promise<void> }

function record(date: string, notes = '伺服器筆記'): StudyRecord & { completionCelebrations: { version: number; half: boolean; complete: boolean } } {
  return { schemaVersion: 2, date, mood: '', wakeTime: '', biggestBlock: '', firstThingTomorrow: '', notes,
    completionCelebrations: { version: 3, half: false, complete: false }, items: [] };
}

async function setup(page: Page, options: { dates?: string[]; changed?: boolean; blockCleanWrite?: boolean; failures?: number; hold?: boolean } = {}): Promise<State> {
  const dates = options.dates ?? [oldDate];
  const state: State = { rows: new Map(), posts: new Map(), failures: new Map(), held: [], holdReads: !!options.hold };
  for (const date of [today, ...dates]) state.rows.set(date, { study_date: date, payload: record(date), revision: 2, updated_at: date === today ? '2026-08-09T00:00:00Z' : '2026-08-01T00:00:00Z' });
  if (options.failures) state.failures.set(oldDate, options.failures);
  await page.context().addInitScript(({ prefix }) => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function simulateStorageCapacity(key, value): void {
      if (this === localStorage && key === prefix + localStorage.getItem('test:block-clean-date')) {
        const parsed = JSON.parse(value);
        if (parsed.localDirty === false) throw new DOMException('simulated full storage', 'QuotaExceededError');
      }
      set.call(this, key, value);
    };
  }, { prefix });
  await page.context().route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url()), requestHeaders = await request.allHeaders();
    const headers = { 'Access-Control-Allow-Origin': requestHeaders.origin || 'http://127.0.0.1:4173',
      'Access-Control-Allow-Headers': requestHeaders['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Credentials': 'true' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: user, headers });
    if (url.pathname.includes('/functions/')) return route.fulfill({ json: { connected: false }, headers });
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const wanted = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      if (wanted && wanted !== today && state.holdReads) { state.held.push(route); return; }
      const rows = wanted ? [...state.rows.values()].filter(row => row.study_date === wanted) : [state.rows.get(today)!];
      return route.fulfill({ json: rows, headers });
    }
    if (url.pathname.endsWith('/rpc/upsert_study_record')) {
      const body = request.postDataJSON(), date = body.p_study_date;
      state.posts.set(date, (state.posts.get(date) ?? 0) + 1);
      const failures = state.failures.get(date) ?? 0;
      if (failures > 0) {
        state.failures.set(date, failures - 1);
        return route.fulfill({ status: 503, json: { message: 'temporary upload unavailable' }, headers });
      }
      const previous = state.rows.get(date);
      if (previous && previous.revision !== body.p_base_revision) return route.fulfill({ json: { ...previous, applied: false }, headers });
      const row = { study_date: date, payload: body.p_payload, revision: (previous?.revision ?? 0) + 1, updated_at: '2026-08-09T01:00:00Z' };
      state.rows.set(date, row);
      await state.beforeSaveReply?.();
      return route.fulfill({ json: { ...row, applied: true }, headers });
    }
    return route.fulfill({ json: [], headers });
  });
  await page.clock.setFixedTime(new Date('2026-08-09T12:00:00+08:00'));
  await page.goto('/summary.html');
  await page.evaluate(({ prefix, today, dates, changed, block, user, watermarkKey, rows }) => {
    localStorage.clear();
    localStorage.setItem('study-v11:meta:active-record-prefix', prefix);
    localStorage.setItem('sb-xcpnxkkixsxzgbqsiuud-auth-token', JSON.stringify({ access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: user.id, role: 'authenticated' })) + '.signature',
      refresh_token: 'test-refresh', token_type: 'bearer', expires_at: 1893456000, expires_in: 3600, user }));
    localStorage.setItem(watermarkKey, '2026-08-09T00:00:00Z');
    for (const row of rows) {
      const dirty = dates.includes(row.study_date);
      const payload = { ...row.payload, ...(dirty && changed ? { notes: '本機新筆記' } : {}) };
      localStorage.setItem(prefix + row.study_date, JSON.stringify({ ...payload, serverRevision: row.revision, serverUpdatedAt: row.updated_at,
        localDirty: dirty, syncConflict: false, syncBase: row.payload }));
    }
    if (block) localStorage.setItem('test:block-clean-date', dates[0]);
  }, { prefix, today, dates, changed: !!options.changed, block: !!options.blockCleanWrite, user,
    watermarkKey: recordSyncWatermarkKey(user.id), rows: [...state.rows.values()] });
  await page.goto('/');
  return state;
}

async function openDetails(page: Page): Promise<void> {
  await page.getByRole('button', { name: '查看詳細', exact: true }).click();
  await expect(page.locator('#cloudPendingDialog')).toBeVisible();
}

test('details list all pending dates and matching cloud contents clear dirty flags without repeat RPC uploads', async ({ page }) => {
  const dates = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'];
  const state = await setup(page, { dates, hold: true });
  await openDetails(page);
  await expect(page.locator('[data-pending-comparison] [data-pending-date]')).toHaveText('');
  await expect(page.locator('[data-pending-count]')).toHaveText('5 天尚待確認或處理');
  await expect(page.locator('[data-pending-list] [data-date]')).toHaveText(dates);
  await expect.poll(() => state.held.length).toBe(5);
  state.holdReads = false;
  for (const route of state.held) await route.fulfill({ json: [state.rows.get(new URL(route.request().url()).searchParams.get('study_date')!.slice(3))!], headers: { 'Access-Control-Allow-Origin': 'http://127.0.0.1:4174' } });
  await expect(page.locator('[data-pending-count]')).toHaveText('目前沒有待同步紀錄');
  for (const date of dates) expect(state.posts.get(date) ?? 0).toBe(0);
  const saved = await page.evaluate(({ prefix, dates }) => dates.map(date => JSON.parse(localStorage.getItem(prefix + date)!)), { prefix, dates });
  expect(saved.every(record => record.localDirty === false && record.__localSyncBase === 'same-content-v1')).toBe(true);
});

test('server success with failed local write remains pending with a reason, then manual retry acknowledges without another upload', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const state = await setup(page, { changed: true, blockCleanWrite: true });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-reason]')).toContainText('雲端已接收，但本機無法寫回同步狀態');
  expect(state.rows.get(oldDate)?.payload.notes).toBe('本機新筆記');
  expect(state.posts.get(oldDate)).toBe(1);
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).localDirty, prefix + oldDate)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('pending-sync-details-mobile.png') });
  await page.evaluate(() => localStorage.removeItem('test:block-clean-date'));
  await row.getByRole('button', { name: '重試同步', exact: true }).click();
  await expect(page.locator('[data-pending-count]')).toHaveText('目前沒有待同步紀錄');
  expect(state.posts.get(oldDate)).toBe(1);
});

test('historical transient failures retry in the background while another date is displayed', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: 1 });
  await expect.poll(() => state.posts.get(oldDate)).toBe(1);
  await page.clock.setFixedTime(new Date('2026-08-09T12:00:10+08:00'));
  await expect.poll(() => state.rows.get(oldDate)?.payload.notes, { timeout: 15_000 }).toBe('本機新筆記');
  expect(state.posts.get(oldDate)).toBe(2);
  await expect(page.locator('#studyDate')).toHaveValue(today);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('已同步');
});

test('a user can pause a date, retain that choice across reload, and explicitly resume it', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停自動同步', exact: true }).click();
  await expect(row.locator('[data-state]')).toHaveText('已暫停');
  const before = state.posts.get(oldDate);
  await page.reload();
  await openDetails(page);
  await expect(row.locator('[data-state]')).toHaveText('已暫停');
  expect(state.posts.get(oldDate)).toBe(before);
  state.failures.delete(oldDate);
  await row.getByRole('button', { name: '恢復並重試', exact: true }).click();
  await expect(page.locator('[data-pending-count]')).toHaveText('目前沒有待同步紀錄');
});

test('comparison lets the user choose a cloud version with confirmation and a recoverable backup', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停自動同步', exact: true }).click();
  await row.getByRole('button', { name: '比較與處理', exact: true }).click();
  await expect(page.locator('[data-pending-comparison]')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '以雲端版本為準', exact: true }).click();
  await expect(page.locator('[data-pending-message]')).toContainText('已完成處理');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).notes, prefix + oldDate)).toBe('伺服器筆記');
  expect(await page.evaluate(key => localStorage.getItem(key) !== null, prefix + '__cloud-conflict-backup__')).toBe(true);
  expect(state.posts.get(oldDate)).toBe(1);
});

test('a changed cloud revision after comparison prevents a stale overwrite', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停自動同步', exact: true }).click();
  await row.getByRole('button', { name: '比較與處理', exact: true }).click();
  await expect(page.locator('[data-pending-comparison]')).toBeVisible();
  state.rows.get(oldDate)!.revision += 1;
  state.rows.get(oldDate)!.payload.notes = '其他裝置剛更新';
  const before = state.posts.get(oldDate);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '以本機版本為準', exact: true }).click();
  await expect(page.locator('[data-pending-message]')).toContainText('資料又有更新');
  expect(state.posts.get(oldDate)).toBe(before);
  expect(state.rows.get(oldDate)!.payload.notes).toBe('其他裝置剛更新');
});

test('local edits made during an explicit cloud overwrite are retained and require a new comparison', async ({ page }) => {
  const state = await setup(page, { changed: true, failures: Infinity });
  await openDetails(page);
  const row = page.locator(`[data-pending-date="${oldDate}"]`);
  await expect(row.locator('[data-state]')).toContainText('同步失敗');
  await row.getByRole('button', { name: '暫停自動同步', exact: true }).click();
  await row.getByRole('button', { name: '比較與處理', exact: true }).click();
  await expect(page.locator('[data-pending-comparison]')).toBeVisible();
  state.failures.delete(oldDate);
  state.beforeSaveReply = async () => {
    await page.evaluate(key => {
      const latest = JSON.parse(localStorage.getItem(key)!);
      latest.notes = '送出後另一頁籤的新筆記';
      latest.localDirty = true;
      localStorage.setItem(key, JSON.stringify(latest));
    }, prefix + oldDate);
  };
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '以本機版本為準', exact: true }).click();
  await expect(page.locator('[data-pending-message]')).toContainText('保留新的本機內容');
  expect(state.rows.get(oldDate)!.payload.notes).toBe('本機新筆記');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).notes, prefix + oldDate)).toBe('送出後另一頁籤的新筆記');
  await expect(page.locator('#cloudPendingDetailsBtn')).toBeVisible();
});
