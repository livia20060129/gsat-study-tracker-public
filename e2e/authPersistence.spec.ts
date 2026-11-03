import { expect, test, type Page, type Route } from '@playwright/test';
import { goHome } from './helpers/siteNavigation.ts';

test.use({ timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
const date = '2026-11-02';
const epoch = new Date('2026-11-02T12:00:00+08:00').getTime();
const user = { id: '00000000-0000-0000-0000-000000000118', email: 'auth-navigation@example.test', role: 'authenticated', aud: 'authenticated' };
const prefix = `study-v11:user:${user.id}:`;
const authKey = 'sb-xcpnxkkixsxzgbqsiuud-auth-token';
const activeKey = 'study-v11:meta:active-record-prefix';

function session(expiresAt = Math.floor(epoch / 1000) + 3600, refreshToken = 'test-refresh') {
  return { access_token: 'eyJhbGciOiJIUzI1NiJ9.' + btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: expiresAt })) + '.signature',
    refresh_token: refreshToken, expires_at: expiresAt, expires_in: 3600, token_type: 'bearer', user };
}
const record = { schemaVersion: 2, date, notes: '保留此帳號的本機筆記', items: [{ id: 'saved-account-item', type: 'general', source: 'custom', title: '已保存項目', done: false, minutes: '12', required: false, f: {} }] };
interface State { refreshCalls: number; holdRefresh?: Route }

async function setup(page: Page, options: { legacy?: boolean; expiresAt?: number; hold?: boolean; revoked?: boolean } = {}): Promise<State> {
  await page.clock.install({ time: new Date(epoch) });
  const state: State = { refreshCalls: 0 };
  const rows = new Map<string, { study_date: string; payload: typeof record; revision: number; updated_at: string }>();
  rows.set(date, { study_date: date, payload: structuredClone(record), revision: 2, updated_at: '2026-11-02T03:00:00Z' });
  await page.route('https://xcpnxkkixsxzgbqsiuud.supabase.co/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.endsWith('/auth/v1/token')) {
      if (url.searchParams.get('grant_type') === 'refresh_token') {
        state.refreshCalls++;
        if (options.revoked) return route.fulfill({ status: 400, json: { code: 'refresh_token_not_found', error: 'invalid_grant', error_description: 'Refresh token has been revoked' } });
        if (options.hold) { state.holdRefresh = route; return; }
        return route.fulfill({ json: session(Math.floor(epoch / 1000) + 7200, 'rotated-refresh') });
      }
      return route.fulfill({ json: session() });
    }
    if (url.pathname.endsWith('/auth/v1/user')) return route.fulfill({ json: user });
    if (url.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204 });
    if (url.pathname.includes('/functions/')) return route.fulfill({ json: { connected: false } });
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const wanted = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      return route.fulfill({ json: [...rows.values()].filter(row => !wanted || row.study_date === wanted) });
    }
    if (url.pathname.endsWith('/rpc/upsert_study_record')) {
      const body = request.postDataJSON(), previous = rows.get(body.p_study_date);
      if (previous && previous.revision !== body.p_base_revision) return route.fulfill({ json: { ...previous, applied: false } });
      const row = { study_date: body.p_study_date, payload: body.p_payload, revision: (previous?.revision ?? 0) + 1, updated_at: '2026-11-02T04:00:00Z' };
      rows.set(row.study_date, row);
      return route.fulfill({ json: { ...row, applied: true } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/material.progress.html');
  await page.evaluate(({ prefix, date, record, activeKey, authKey, legacy, authSession }) => {
    localStorage.clear();
    localStorage.setItem(activeKey, legacy ? prefix : 'study-v11:guest:');
    localStorage.setItem(prefix + date, JSON.stringify(record));
    if (legacy) localStorage.setItem(authKey, JSON.stringify(authSession));
  }, { prefix, date, record, activeKey, authKey, legacy: options.legacy === true, authSession: session(options.expiresAt) });
  return state;
}

async function settings(page: Page): Promise<void> {
  if (!await page.locator('#connectionSettings').evaluate(node => (node as HTMLDetailsElement).open)) await page.locator('#connectionSettings summary').click();
}
async function loggedIn(page: Page): Promise<void> {
  await expect(page.locator('#cloudUserEmail')).toHaveText(user.email);
  await expect(page.locator('#cloudLoggedIn')).not.toHaveAttribute('hidden', '');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), activeKey)).toBe(prefix);
}
async function signIn(page: Page): Promise<void> {
  await page.goto('/'); await settings(page);
  await expect(page.locator('#cloudEmail')).toBeVisible();
  await expect(page.locator('#cloudMessage')).toHaveText('目前未登入；使用獨立訪客本機資料。');
  await page.locator('#cloudEmail').fill(user.email);
  await page.locator('#cloudPassword').fill('dummy-password');
  await page.locator('#cloudSignInBtn').click();
  await loggedIn(page);
}
async function returnHome(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await goHome(page);
  await loggedIn(page);
  await expect(page.locator('#notes')).toHaveValue(record.notes);
}
async function storedSession(page: Page): Promise<string | null> {
  return page.evaluate(key => new Promise<string | null>((resolve, reject) => {
    const request = indexedDB.open('gsat-study-tracker-auth', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, transaction = database.transaction('sessions', 'readonly');
      const read = transaction.objectStore('sessions').get(key);
      transaction.oncomplete = () => { resolve(read.result?.value ?? null); database.close(); };
      transaction.onerror = () => reject(transaction.error);
    };
  }), authKey);
}

test('login survives every standalone page, browser history and reload on desktop and mobile', async ({ page }) => {
  test.setTimeout(60_000);
  await setup(page); await signIn(page);
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ['/todo.html', '/summary.html', '/material.progress.html', '/vocabulary.review.html']) await returnHome(page, path);
  }
  await page.reload(); await loggedIn(page);
  await page.goto('/summary.html'); await page.goBack(); await loggedIn(page);
  await page.goForward(); await goHome(page); await loggedIn(page);
  expect(await storedSession(page)).toContain('test-refresh');
});

test('failed localStorage capability probes do not turn a login into page-only memory', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('lswt-') || key === 'study-v11:storage-test') throw new DOMException('Storage full', 'QuotaExceededError');
      set.call(this, key, value);
    };
  });
  await signIn(page);
  await returnHome(page, '/todo.html');
  await returnHome(page, '/summary.html');
  expect(await storedSession(page)).not.toBeNull();
});

test('auth persists when its localStorage mirror cannot be written', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('sb-')) throw new DOMException('Storage full', 'QuotaExceededError');
      set.call(this, key, value);
    };
  });
  await signIn(page);
  expect(await page.evaluate(key => localStorage.getItem(key), authKey)).toBeNull();
  await returnHome(page, '/todo.html'); await returnHome(page, '/summary.html');
  expect(await storedSession(page)).toContain('test-refresh');
});

test('legacy sessions migrate and an expired token refreshes after returning from a standalone page', async ({ page }) => {
  const state = await setup(page, { legacy: true, expiresAt: Math.floor(epoch / 1000) + 120 });
  await page.goto('/'); await loggedIn(page);
  await page.goto('/summary.html'); await page.clock.fastForward(180_000);
  await goHome(page); await loggedIn(page);
  await expect.poll(() => state.refreshCalls).toBeGreaterThan(0);
  expect(await storedSession(page)).toContain('rotated-refresh');
  await expect(page.locator('#notes')).toHaveValue(record.notes);
});

test('a slow session refresh keeps the account cache and a late success restores login without a guest switch', async ({ page }) => {
  const state = await setup(page, { legacy: true, expiresAt: Math.floor(epoch / 1000) - 60, hold: true });
  await page.goto('/');
  await expect.poll(() => !!state.holdRefresh).toBe(true);
  await page.clock.fastForward(16_000);
  await settings(page);
  await expect(page.locator('#cloudStatusBadge')).toHaveText('登入確認暫停');
  await expect(page.locator('#cloudMessage')).toContainText('這不代表已登出');
  await expect(page.locator('#notes')).toHaveValue(record.notes);
  expect(await page.evaluate(key => localStorage.getItem(key), activeKey)).toBe(prefix);
  await page.locator('#notes').fill('登入恢復期間輸入的筆記');
  await state.holdRefresh!.fulfill({ json: session(Math.floor(epoch / 1000) + 7200, 'late-refresh') });
  await loggedIn(page);
  await expect(page.locator('#notes')).toHaveValue('登入恢復期間輸入的筆記');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).notes, prefix + date)).toBe(record.notes);
  await page.locator('#notes').blur();
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key)!).notes, prefix + date)).toBe('登入恢復期間輸入的筆記');
  await expect(page.locator('#cloudMessage')).not.toContainText('已登出');
});

test('explicit logout stays logged out across navigation even if a legacy token remains', async ({ page }) => {
  await setup(page); await signIn(page); await settings(page);
  await page.locator('#cloudSignOutBtn').click();
  await expect(page.locator('#cloudLoggedOut')).toBeVisible();
  await expect.poll(() => storedSession(page)).toBeNull();
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: authKey, value: session() });
  await page.goto('/summary.html'); await goHome(page); await settings(page);
  await expect(page.locator('#cloudLoggedOut')).toBeVisible();
  await expect(page.locator('#cloudUserEmail')).toBeEmpty();
  expect(await page.evaluate(key => localStorage.getItem(key), activeKey)).toBe('study-v11:guest:');
  expect(await page.evaluate(key => localStorage.getItem(key), prefix + date)).toContain(record.notes);
});

test('unavailable persistent auth storage is reported without claiming a successful login or resetting the account scope', async ({ page }) => {
  await setup(page, { legacy: true });
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function blocked(): never { throw new DOMException('Storage blocked', 'SecurityError'); };
  });
  await page.goto('/'); await settings(page);
  await expect(page.locator('#cloudMessage')).toContainText('無法保存登入狀態');
  await expect(page.locator('#cloudUserEmail')).toBeEmpty();
  await expect(page.locator('#notes')).toHaveValue(record.notes);
  expect(await page.evaluate(key => localStorage.getItem(key), activeKey)).toBe(prefix);
  await page.locator('#cloudEmail').fill(user.email);
  await page.locator('#cloudPassword').fill('dummy-password');
  await page.locator('#cloudSignInBtn').click();
  await expect(page.locator('#cloudMessage')).toContainText('登入失敗');
  await expect(page.locator('#cloudUserEmail')).toBeEmpty();
});

test('a genuinely revoked expired session signs out without deleting the account records', async ({ page }) => {
  const state = await setup(page, { legacy: true, expiresAt: Math.floor(epoch / 1000) - 60, revoked: true });
  await page.goto('/'); await settings(page);
  await expect(page.locator('#cloudLoggedOut')).toBeVisible();
  await expect(page.locator('#cloudMessage')).toContainText('已登出');
  expect(state.refreshCalls).toBeGreaterThan(0);
  expect(await storedSession(page)).toBeNull();
  expect(await page.evaluate(key => localStorage.getItem(key), prefix + date)).toContain(record.notes);
  expect(await page.evaluate(key => localStorage.getItem(key), activeKey)).toBe('study-v11:guest:');
});

test('an explicit sign-out propagates to another Tracker tab and survives its reload', async ({ page, context }) => {
  await setup(page, { legacy: true });
  await page.goto('/'); await loggedIn(page);
  const other = await context.newPage();
  await setup(other, { legacy: true }); await other.goto('/'); await loggedIn(other);
  await settings(page); await page.locator('#cloudSignOutBtn').click();
  await expect(page.locator('#cloudUserEmail')).toBeEmpty();
  await expect(other.locator('#cloudUserEmail')).toBeEmpty();
  await other.reload(); await settings(other);
  await expect(other.locator('#cloudLoggedOut')).toBeVisible();
  expect(await storedSession(other)).toBeNull();
});
