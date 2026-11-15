import assert from 'node:assert/strict';
import test from 'node:test';
import { beginGoogleAuthentication, cleanGoogleAuthReturnUrl, clearGoogleAuthIntent, completeGoogleAuthReturn,
  GOOGLE_AUTH_INTENT_KEY, googleAuthErrorMessage, googleAuthFetch, googleAuthReturnUrl, parseGoogleAuthIntent,
  prepareGoogleAuthReturn, type GoogleAuthIntent, type GoogleAuthStorage, type GoogleOAuthApi } from '../src/application/cloud/googleAccountAuth.ts';

const now = Date.parse('2026-11-15T04:00:00Z');
const publicApi = 'https://xcpnxkkixsxzgbqsiuud.supabase.co';
function store(): GoogleAuthStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return { values, async getItem(key) { return values.get(key) ?? null; }, async setItem(key, value) { values.set(key, value); }, async removeItem(key) { values.delete(key); } };
}
function intent(): GoogleAuthIntent { return { version: 1, kind: 'signin', attempt: 'attempt-a', date: '2026-11-14', startedAt: now }; }
function fixture() {
  const storage = store(), redirects: string[] = [], requests: unknown[] = [];
  const auth: GoogleOAuthApi = { async signInWithOAuth(options) {
    requests.push(options);
    return { data: { url: `${publicApi}/auth/v1/authorize?provider=google&code_challenge=challenge&code_challenge_method=s256&skip_http_redirect=true` }, error: null };
  } };
  const options = { auth, storage, supabaseUrl: publicApi, href: 'https://gsat-study-tracker.liviayeh.dev/index.html?date=2026-11-14',
    date: '2026-11-14', currentUserId(): string | null { return null; }, saveDraft() { return true; }, redirect(url: string) { redirects.push(url); }, now, attempt: 'attempt-a' };
  return { storage, redirects, requests, auth, options };
}

test('public OAuth callback stays on the current site and preserves the chosen date in durable storage', async () => {
  const f = fixture(); await beginGoogleAuthentication(f.options);
  assert.equal(googleAuthReturnUrl(f.options.href), 'https://gsat-study-tracker.liviayeh.dev/index.html?google_auth=1');
  assert.equal(JSON.parse(f.storage.values.get(GOOGLE_AUTH_INTENT_KEY)!).date, '2026-11-14');
  assert.equal(new URL(f.redirects[0]).searchParams.has('skip_http_redirect'), false);
  assert.deepEqual(f.requests, [{ provider: 'google', options: { redirectTo: googleAuthReturnUrl(f.options.href), scopes: 'openid email profile', queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true } }]);
});

test('sign-in intents reject obsolete account-linking requests, invalid dates and expired data', () => {
  assert.ok(parseGoogleAuthIntent(JSON.stringify(intent()), now));
  for (const change of [{ kind: 'link', userId: 'old-user' }, { date: '2026-02-30' }, { startedAt: now - 21 * 60_000 }, { startedAt: now + 1 }, { attempt: '' }]) {
    assert.equal(parseGoogleAuthIntent(JSON.stringify({ ...intent(), ...change }), now), null);
  }
});

test('draft or durable-storage failures prevent redirecting away from the record', async () => {
  for (const mode of ['draft', 'storage']) {
    const f = fixture();
    if (mode === 'draft') f.options.saveDraft = () => false;
    else f.storage.setItem = async () => { throw new Error('storage unavailable'); };
    await assert.rejects(beginGoogleAuthentication(f.options));
    assert.equal(f.redirects.length, 0);
  }
});

test('unexpected destinations and missing PKCE protection cannot start public sign-in', async () => {
  for (const url of ['https://attacker.test/auth/v1/authorize?provider=google', `${publicApi}/auth/v1/authorize?provider=google`, `${publicApi}/auth/v1/authorize?provider=github&code_challenge=x&code_challenge_method=s256`]) {
    const f = fixture(); f.auth.signInWithOAuth = async () => ({ data: { url }, error: null });
    await assert.rejects(beginGoogleAuthentication(f.options));
    assert.equal(f.redirects.length, 0); assert.equal(f.storage.values.has(GOOGLE_AUTH_INTENT_KEY), false);
  }
});

test('a changed account or a newer attempt blocks a late redirect without clearing the newer attempt', async () => {
  const f = fixture(); f.options.currentUserId = () => 'other-user';
  await assert.rejects(beginGoogleAuthentication(f.options)); assert.equal(f.redirects.length, 0);
  const peer = fixture();
  peer.auth.signInWithOAuth = async () => {
    await peer.storage.setItem(GOOGLE_AUTH_INTENT_KEY, JSON.stringify({ ...intent(), attempt: 'newer' }));
    return { data: { url: `${publicApi}/auth/v1/authorize?provider=google&code_challenge=x&code_challenge_method=s256` }, error: null };
  };
  await assert.rejects(beginGoogleAuthentication(peer.options));
  assert.equal(JSON.parse(peer.storage.values.get(GOOGLE_AUTH_INTENT_KEY)!).attempt, 'newer');
});

test('callback preparation requires valid stored context and hides provider error descriptions', async () => {
  const storage = store();
  for (const suffix of ['?code=recovery-code', '#access_token=old&refresh_token=old&type=recovery']) {
    const retired = await prepareGoogleAuthReturn('https://tracker.test/' + suffix, storage, now);
    assert.equal(retired.requested, true); assert.equal(retired.allowExchange, false);
    assert.ok(retired.error!.includes('此登入連結已停用'));
  }
  assert.equal((await prepareGoogleAuthReturn('https://tracker.test/?google_auth=1&code=abc', storage, now)).allowExchange, false);
  await storage.setItem(GOOGLE_AUTH_INTENT_KEY, JSON.stringify(intent()));
  assert.equal((await prepareGoogleAuthReturn('https://tracker.test/?google_auth=1&code=abc', storage, now)).allowExchange, true);
  const canceled = await prepareGoogleAuthReturn('https://tracker.test/?google_auth=1&error=access_denied&error_description=secret', storage, now);
  assert.equal(canceled.allowExchange, false); assert.ok(canceled.error!.includes('已取消')); assert.ok(!canceled.error!.includes('secret'));
});

test('Google login uses the existing bound UUID without changing any record storage', async () => {
  const storage = store(); storage.values.set('study-v11:user:existing:2026-11-14', 'retained-record');
  await storage.setItem(GOOGLE_AUTH_INTENT_KEY, JSON.stringify(intent()));
  const user = { id: 'existing', identities: [{ provider: 'email' }, { provider: 'google' }] };
  const result = await completeGoogleAuthReturn({ requested: true, intent: intent(), error: null, allowExchange: true }, storage, {
    async initialize() { return { error: null }; }, async getSession() { return { data: { session: { user } }, error: null }; }, async signOut() {},
  });
  assert.equal(result.ok, true); assert.ok(result.message.includes('原帳號'));
  assert.equal(storage.values.get('study-v11:user:existing:2026-11-14'), 'retained-record');
  assert.equal(storage.values.has(GOOGLE_AUTH_INTENT_KEY), false);
});

test('failed initialization never reports an old session as a newly successful login', async () => {
  const result = await completeGoogleAuthReturn({ requested: true, intent: intent(), error: null, allowExchange: true }, store(), {
    async initialize() { return { error: { code: 'bad_code_verifier' } }; }, async getSession() { throw new Error('must not inspect stale session'); }, async signOut() {},
  });
  assert.equal(result.ok, false);
});

test('non-Google callback responses do not claim Google sign-in success', async () => {
  const result = await completeGoogleAuthReturn({ requested: true, intent: intent(), error: null, allowExchange: true }, store(), {
    async initialize() { return { error: null }; }, async getSession() { return { data: { session: { user: { id: 'email-user', identities: [{ provider: 'email' }] } } }, error: null }; }, async signOut() {},
  });
  assert.equal(result.ok, false);
});

test('callback cleanup removes credentials, retains dates and cannot clear a newer attempt', async () => {
  assert.equal(cleanGoogleAuthReturnUrl('https://tracker.test/index.html?google_auth=1&code=private#access_token=private', '2026-11-14'), 'https://tracker.test/index.html?date=2026-11-14');
  const storage = store(); await storage.setItem(GOOGLE_AUTH_INTENT_KEY, JSON.stringify(intent()));
  await clearGoogleAuthIntent(storage, 'different'); assert.ok(storage.values.has(GOOGLE_AUTH_INTENT_KEY));
});

test('the bounded PKCE fetch preserves unrelated requests and never exposes private server messages', async () => {
  const calls: string[] = [];
  const base: typeof fetch = async input => { calls.push(String(input)); return Response.json({ ok: true }); };
  await googleAuthFetch(base, publicApi)(`${publicApi}/auth/v1/token?grant_type=pkce`, { method: 'POST' });
  await googleAuthFetch(base, publicApi)('https://example.test/');
  assert.equal(calls.length, 2);
  assert.ok(!googleAuthErrorMessage({ code: 'unknown', message: 'private-provider-secret' }).includes('private-provider-secret'));
});
