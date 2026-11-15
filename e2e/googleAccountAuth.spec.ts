import { createHash } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { goHome } from './helpers/siteNavigation.ts';

test.use({ timezoneId: 'Asia/Taipei', reducedMotion: 'reduce' });
const date = '2026-11-14';
const epoch = new Date('2026-11-15T12:00:00+08:00').getTime();
const api = 'https://xcpnxkkixsxzgbqsiuud.supabase.co';
const userId = '00000000-0000-0000-0000-000000000180';
const wrongId = '00000000-0000-0000-0000-000000000181';
const prefix = `study-v11:user:${userId}:`;
const authKey = 'sb-xcpnxkkixsxzgbqsiuud-auth-token';
const activeKey = 'study-v11:meta:active-record-prefix';
const intentKey = 'study-v11:auth:google-intent';
const original = { schemaVersion: 2, date, notes: '原帳號紀錄', items: [{ id: 'original-item', type: 'general', title: '保留項目', source: 'custom', required: false, done: false, minutes: '18', f: {} }] };
const user = (google = false, id = userId) => ({ id, email: 'account@example.test', aud: 'authenticated', role: 'authenticated',
  app_metadata: { provider: google ? 'google' : 'email', providers: google ? ['email', 'google'] : ['email'] },
  identities: google ? [{ id: 'email-identity', provider: 'email' }, { id: 'google-identity', provider: 'google' }] : [{ id: 'email-identity', provider: 'email' }] });
function session(google = false, id = userId) {
  const expires = Math.floor(epoch / 1000) + 7200;
  return { access_token: 'eyJhbGciOiJIUzI1NiJ9.' + Buffer.from(JSON.stringify({ sub: id, role: 'authenticated', exp: expires })).toString('base64url') + '.' + Buffer.from('test-signature').toString('base64url'),
    refresh_token: 'persistent-refresh', expires_at: expires, expires_in: 7200, token_type: 'bearer', user: user(google, id) };
}
async function settings(page: Page): Promise<void> {
  if (!await page.locator('#connectionSettings').evaluate(node => (node as HTMLDetailsElement).open)) await page.locator('#connectionSettings summary').click();
}
interface MockState {
  authorizations: URL[]; links: URL[]; challenge: string; redirect: string; tokenRequests: number;
  uploadUsers: string[]; calendarActions: string[]; google: boolean; cancel: boolean; wrong: boolean;
  errorCode: string; providerDisabled: boolean; recovery: URL | null;
}
async function setup(page: Page, signedIn = false): Promise<MockState> {
  await page.clock.setFixedTime(new Date(epoch));
  const state: MockState = { authorizations: [], links: [], challenge: '', redirect: '', tokenRequests: 0, uploadUsers: [], calendarActions: [],
    google: signedIn, cancel: false, wrong: false, errorCode: '', providerDisabled: false, recovery: null };
  const rows = new Map<string, { study_date: string; payload: typeof original; revision: number; updated_at: string }>();
  if (signedIn) rows.set(date, { study_date: date, payload: structuredClone(original), revision: 2, updated_at: '2026-11-14T03:00:00Z' });
  await page.route(`${api}/**`, async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === '/auth/v1/authorize') {
      state.authorizations.push(url);
      state.challenge = url.searchParams.get('code_challenge')!;
      state.redirect = url.searchParams.get('redirect_to')!;
      expect(url.searchParams.has('skip_http_redirect')).toBe(false);
      const callback = new URL(state.redirect);
      if (state.cancel) callback.searchParams.set('error', 'access_denied');
      else if (state.providerDisabled) callback.searchParams.set('error_code', 'provider_disabled');
      else callback.searchParams.set('code', 'google-signin-code');
      // WebKit route.fulfill cannot synthesize an HTTP redirect response.
      return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
    }
    if (url.pathname === '/auth/v1/user/identities/authorize') {
      state.links.push(url);
      state.challenge = url.searchParams.get('code_challenge')!;
      state.redirect = url.searchParams.get('redirect_to')!;
      if (state.errorCode) return route.fulfill({ status: 422, headers: {
        'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version',
      }, json: { code: state.errorCode, msg: 'private-internal-server-detail' } });
      return route.fulfill({ json: { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=server-signed-state' } });
    }
    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'pkce') {
        state.tokenRequests++;
        const body = request.postDataJSON();
        expect(createHash('sha256').update(body.code_verifier).digest('base64url')).toBe(state.challenge);
        const recovery = body.auth_code === 'recovery-code';
        state.google = !recovery && !state.wrong;
        return route.fulfill({ json: session(!recovery, state.wrong ? wrongId : userId) });
      }
      return route.fulfill({ json: session(state.google) });
    }
    if (url.pathname === '/auth/v1/user') return route.fulfill({ json: user(state.google) });
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (url.pathname === '/auth/v1/recover') {
      state.recovery = url;
      state.challenge = request.postDataJSON().code_challenge;
      return route.fulfill({ json: {} });
    }
    if (url.pathname.includes('/functions/')) {
      const action = request.postData()?.startsWith('{') ? request.postDataJSON().action : '';
      state.calendarActions.push(action || '');
      return route.fulfill({ json: { connected: signedIn, calendar_id: 'primary', tasks: [], last_synced_at: '2026-11-14T03:00:00Z' } });
    }
    if (url.pathname.endsWith('/rest/v1/study_records')) {
      const wanted = url.searchParams.get('study_date')?.replace(/^eq\./, '');
      return route.fulfill({ json: [...rows.values()].filter(row => !wanted || row.study_date === wanted) });
    }
    if (url.pathname.endsWith('/rpc/upsert_study_record')) {
      const token = request.headers().authorization?.replace(/^Bearer /, '').split('.')[1];
      if (token) state.uploadUsers.push(JSON.parse(Buffer.from(token, 'base64url').toString()).sub);
      const body = request.postDataJSON(), prior = rows.get(body.p_study_date);
      const row = { study_date: body.p_study_date, payload: body.p_payload, revision: (prior?.revision ?? 0) + 1, updated_at: '2026-11-15T04:00:00Z' };
      rows.set(row.study_date, row);
      return route.fulfill({ json: { ...row, applied: true } });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('https://accounts.google.com/o/oauth2/**', async route => {
    const callback = new URL(state.redirect);
    callback.searchParams.set(state.cancel ? 'error' : 'code', state.cancel ? 'access_denied' : 'google-link-code');
    return route.fulfill({ contentType: 'text/html', body: `<script>location.replace(${JSON.stringify(callback.href)})</script>` });
  });
  await page.goto('/material.progress.html');
  await page.evaluate(({ signedIn, prefix, authKey, activeKey, original, authSession }) => {
    localStorage.clear();
    const scope = signedIn ? prefix : 'study-v11:guest:';
    localStorage.setItem(activeKey, scope);
    localStorage.setItem(scope + original.date, JSON.stringify(original));
    if (signedIn) localStorage.setItem(authKey, JSON.stringify(authSession));
  }, { signedIn, prefix, authKey, activeKey, original, authSession: session(true) });
  await page.goto(`/index.html?date=${date}`);
  await settings(page);
  if (signedIn) await expect(page.locator('#cloudLoggedIn')).toBeVisible();
  else await expect(page.locator('#cloudGoogleSignInBtn')).toBeVisible();
  return state;
}
async function accountScope(page: Page): Promise<string | null> { return page.evaluate(key => localStorage.getItem(key), activeKey); }
async function saved(page: Page) { return page.evaluate(({ prefix, date }) => JSON.parse(localStorage.getItem(prefix + date)!), { prefix, date }); }

test('Google-only login uses PKCE, imports the guest draft and restores the chosen date across every page', async ({ page }) => {
  const state = await setup(page);
  await expect(page.locator('#cloudGoogleSignInBtn')).toHaveText('使用 Google 登入');
  await expect(page.locator('#cloudEmail,#cloudPassword,#cloudGoogleLinkBtn,#cloudSignUpBtn,#cloudForgotPasswordBtn')).toHaveCount(0);
  await page.locator('#notes').fill('Google 登入前的訪客草稿');
  await page.locator('#cloudGoogleSignInBtn').click();
  await expect(page.locator('#cloudUserEmail')).toHaveText(user().email);
  await expect.poll(() => accountScope(page)).toBe(prefix);
  await expect(page.locator('#studyDate')).toHaveValue(date);
  await expect(page.locator('#notes')).toHaveValue('Google 登入前的訪客草稿');
  expect(state.authorizations).toHaveLength(1);
  expect(state.authorizations[0].searchParams.get('scopes') || state.authorizations[0].searchParams.get('scope')).toContain('openid');
  expect(state.links).toHaveLength(0);
  expect(state.tokenRequests).toBe(1);
  for (const path of ['/todo.html','/summary.html','/material.progress.html','/vocabulary.review.html']) {
    await page.goto(path); await goHome(page);
    await expect(page.locator('#cloudUserEmail')).toHaveText(user().email);
    expect(await accountScope(page)).toBe(prefix);
  }
});

test('an already bound account signs back in with the original UUID and retained data', async ({ page }) => {
  const state = await setup(page, true);
  await expect(page.locator('#cloudGoogleLinkBtn')).toHaveCount(0);
  await page.locator('#cloudSignOutBtn').click();
  await expect(page.locator('#cloudGoogleSignInBtn')).toBeVisible();
  await page.locator('#cloudGoogleSignInBtn').click();
  await expect(page.locator('#cloudUserEmail')).toHaveText(user().email);
  expect(await accountScope(page)).toBe(prefix);
  expect((await saved(page)).notes).toBe(original.notes);
  expect(state.uploadUsers.every(id => id === userId)).toBe(true);
  expect(state.links).toHaveLength(0);
});

for (const mode of ['cancel', 'disabled'] as const) test(`Google ${mode} retains the draft and allows retry without password fallback`, async ({ page }) => {
  const state = await setup(page);
  state.cancel = mode === 'cancel'; state.providerDisabled = mode === 'disabled';
  await page.locator('#notes').fill('取消或失敗時仍保留的草稿');
  await page.locator('#cloudGoogleSignInBtn').click();
  await expect(page.locator('#cloudGoogleMessage')).toContainText(mode === 'cancel' ? '已取消' : '尚未完成設定');
  await expect(page.locator('#notes')).toHaveValue('取消或失敗時仍保留的草稿');
  await expect(page.locator('#cloudGoogleSignInBtn')).toBeEnabled();
  expect(state.tokenRequests).toBe(0);
  state.cancel = false; state.providerDisabled = false;
  await page.locator('#cloudGoogleSignInBtn').click();
  await expect(page.locator('#cloudUserEmail')).toHaveText(user().email);
});

test('failed draft storage prevents leaving the current page', async ({ page }) => {
  const state = await setup(page);
  await page.locator('#notes').fill('尚未保存的草稿');
  await page.evaluate(date => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value): void {
      if (key === `study-v11:guest:${date}`) throw new DOMException('storage unavailable', 'QuotaExceededError');
      set.call(this, key, value);
    };
  }, date);
  await page.locator('#cloudGoogleSignInBtn').click();
  await expect(page.locator('#cloudGoogleMessage')).toContainText('儲存空間');
  await expect(page.locator('#notes')).toHaveValue('尚未保存的草稿');
  expect(state.authorizations).toHaveLength(0);
});

test('a missing OAuth intent cannot exchange a code or replace an existing account', async ({ page }) => {
  const state = await setup(page, true);
  await page.goto(`/index.html?google_auth=1&code=unexpected&date=${date}`);
  await expect(page.locator('#cloudGoogleMessage')).toContainText('登入連結已過期');
  expect(state.tokenRequests).toBe(0);
  expect(await accountScope(page)).toBe(prefix);
  await expect(page.locator('#notes')).toHaveValue(original.notes);
});

test('legacy password recovery links cannot create a new public login', async ({ page }) => {
  const state = await setup(page);
  const token = session(false);
  await page.goto(`/index.html#access_token=${token.access_token}&refresh_token=${token.refresh_token}&type=recovery`);
  await expect(page.locator('#cloudGoogleMessage')).toContainText('只提供 Google 登入');
  await expect(page.locator('#passwordRecoveryDialog')).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe('');
  expect(await accountScope(page)).toBe('study-v11:guest:');
  expect(state.tokenRequests).toBe(0);
  await page.goto('/index.html?code=recovery-code');
  await expect(page.locator('#cloudGoogleMessage')).toContainText('此登入連結已停用');
  expect(new URL(page.url()).searchParams.has('code')).toBe(false);
  await settings(page);
  await expect(page.locator('#cloudGoogleSignInBtn')).toBeVisible();
  expect(state.tokenRequests).toBe(0);
});

test.describe('mobile Google-only access', () => {
  test.use({ viewport: { width: 320, height: 812 }, isMobile: true, hasTouch: true });
  test('the Google button remains tappable and returns to the same date without overflow', async ({ page }, testInfo) => {
    await setup(page);
    const button = page.locator('#cloudGoogleSignInBtn');
    expect(await button.evaluate(node => node.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    await button.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('google-only-mobile.png') });
    await button.tap();
    await expect(page.locator('#cloudUserEmail')).toHaveText(user().email);
    await expect(page.locator('#studyDate')).toHaveValue(date);
    await settings(page);
    expect(await page.locator('#cloudPanel').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(page.locator('#cloudGoogleLinkBtn')).toHaveCount(0);
  });
});
