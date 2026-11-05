import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudTranslationClient } from '../src/application/cloudTranslationClient.ts';
import { createCloudTranslationHandler } from '../supabase/functions/_shared/cloudTranslationHandler.ts';
import { cloudTranslationQuota, reserveCloudTranslationRequest } from '../supabase/functions/_shared/cloudTranslationQuota.ts';
import type { CloudTranslation } from '../src/study/cloudTranslation.ts';

const result: CloudTranslation = { provider: 'google-cloud-translation', text: 'cell', translatedText: '細胞', sourceLanguage: 'en', targetLanguage: 'zh-TW' };
const quota = { allowed: false, used: 4999, remaining: 1, limit: 5000, resetsAt: '2026-12-01T00:00:00+08:00' };
const scope = 'study-v11:user:user-a:';
const signal = (): AbortSignal => new AbortController().signal;

test('quota retry uses one receipt and stops after two failed attempts', async () => {
  const receipts: string[] = [];
  const value = await reserveCloudTranslationRequest(async id => {
    receipts.push(id);
    if (receipts.length === 1) throw new Error('response lost after commit');
    return quota;
  }, 'same-receipt');
  assert.deepEqual(receipts, ['same-receipt', 'same-receipt']);
  assert.deepEqual(value, quota);
  let attempts = 0;
  await assert.rejects(reserveCloudTranslationRequest(async () => { attempts++; throw new Error('offline'); }, 'id'), /unavailable/);
  assert.equal(attempts, 2);
});
test('only validated quota metadata appears in character-limit feedback', async () => {
  assert.equal(cloudTranslationQuota({ ...quota, limit: 5001 }), null);
  assert.equal(cloudTranslationQuota({ ...quota, remaining: 100 }), null);
  const client = createCloudTranslationClient({ scope: () => scope, session: async () => ({ userId: 'user-a', accessToken: 'token' }),
    request: async () => Response.json({ ok: false, quota, message: 'secret' }, { status: 429 }) });
  await assert.rejects(client.translate('cell', scope, signal()), error => {
    assert.match(String(error), /4,999／5,000 字元.*剩餘 1 字元/);
    assert.match(String(error), /2026.*12.*01/);
    assert.doesNotMatch(String(error), /secret/);
    return true;
  });
});
test('browser requests share successful work and a cache hit still requires the correct active account', async () => {
  let calls = 0, signedIn = true;
  const client = createCloudTranslationClient({ scope: () => scope,
    session: async () => signedIn ? { userId: 'user-a', accessToken: 'token' } : null,
    request: async () => { calls++; return Response.json({ ok: true, result }); } });
  const values = await Promise.all([client.translate('cell', scope, signal()), client.translate('cell', scope, signal())]);
  values[0].translatedText = 'cannot corrupt the cache';
  assert.equal((await client.translate('cell', scope, signal())).translatedText, '細胞');
  assert.equal(calls, 1);
  signedIn = false;
  await assert.rejects(client.translate('cell', scope, signal()), /登入/);
});
test('canceling one subscriber preserves another subscriber of the same paid request', async () => {
  let release!: () => void;
  const ready = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  const client = createCloudTranslationClient({ scope: () => scope, session: async () => ({ userId: 'user-a', accessToken: 'token' }),
    request: async (_token, _text, requestSignal) => { calls++; await ready; assert.equal(requestSignal.aborted, false); return Response.json({ ok: true, result }); } });
  const first = new AbortController();
  const a = client.translate('cell', scope, first.signal);
  const b = client.translate('cell', scope, signal());
  await Promise.resolve(); await Promise.resolve();
  first.abort();
  await assert.rejects(a, /取消/);
  release();
  assert.equal((await b).translatedText, '細胞');
  assert.equal(calls, 1);
});
test('server cache and in-flight work are account-scoped and always authenticate before reuse', async () => {
  let reservations = 0, translations = 0;
  const handler = createCloudTranslationHandler({ configured: () => true, authenticate: async token => token === 'invalid' ? null : token,
    reserve: async () => { reservations++; return true; }, translate: async () => { translations++; return result; } });
  function request(token: string): Request { return new Request('https://example.test/', { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'cell' }) }); }
  const responses = await Promise.all([handler(request('a')), handler(request('a'))]);
  assert.ok(responses.every(response => response.status === 200));
  assert.equal((await handler(request('a'))).status, 200);
  assert.equal(reservations, 1);
  assert.equal((await handler(request('invalid'))).status, 401);
  assert.equal((await handler(request('b'))).status, 200);
  assert.equal(reservations, 2);
  assert.equal(translations, 2);
});
