import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudTranslationInput, cloudTranslationResult, cloudTranslationSources, type CloudTranslation } from '../src/study/cloudTranslation.ts';
import { applyCloudTranslation } from '../src/study/cloudTranslationSelection.ts';
import { createCloudTranslationClient } from '../src/application/cloudTranslationClient.ts';
import { updateVocabularyWordEntries, vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { createCloudTranslationHandler, type CloudTranslationPorts } from '../supabase/functions/_shared/cloudTranslationHandler.ts';
import { requestGoogleTranslation } from '../supabase/functions/_shared/googleCloudTranslation.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';

const result: CloudTranslation = { provider: 'google-cloud-translation', text: 'cell', translatedText: '細胞', sourceLanguage: 'en', targetLanguage: 'zh-TW' };
const scope = 'study-v11:user:user-a:';
function request(text: unknown = 'cell', token = 'valid'): Request {
  return new Request('https://example.test/cloud-translate', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text, userId: 'forged-user', target: 'evil', apiKey: 'ignored' }) });
}
function ports(overrides: Partial<CloudTranslationPorts> = {}): CloudTranslationPorts {
  return { authenticate: async () => 'verified-user', configured: () => true, reserve: async () => true, translate: async () => result, ...overrides };
}

test('Cloud Translation accepts bounded English sentences and retains exact output without credentials or arbitrary metadata', () => {
  assert.equal(cloudTranslationInput(' Hello, world!\r\n How are you? '), 'Hello, world!\n How are you?');
  for (const value of ['', '中文', 'a'.repeat(2001), 'hello\u0000world', null]) assert.equal(cloudTranslationInput(value), null);
  assert.equal(cloudTranslationResult({ ...result, targetLanguage: 'en' }), null);
  assert.equal(cloudTranslationResult(result, 'another word'), null);
  assert.deepEqual(cloudTranslationResult({ ...result, apiKey: 'must-not-survive', token: 'secret' }), result);
  assert.equal(cloudTranslationSources([...Array(10).fill(result), { provider: 'evil' }]).length, 1);
});

test('confirmation preserves manual meanings, POS, levels, stars and existing sources, and is idempotent', () => {
  const word: EnglishReviewWordEntry = { text: 'Cell', noun: true, gsatLevel: 3, translation: '原有人工翻譯',
    translationsByPartOfSpeech: { noun: ['原有人工翻譯'] }, vocabularyStars: { card: true }, dictionarySources: [{ provider: 'ecdict' }] };
  assert.equal(applyCloudTranslation(word, result), true);
  assert.deepEqual(word.translationsByPartOfSpeech, { noun: ['原有人工翻譯'], unclassified: ['細胞'] });
  assert.equal(word.gsatLevel, 3);
  assert.equal(word.noun, true);
  assert.deepEqual(word.vocabularyStars, { card: true });
  assert.deepEqual(word.dictionarySources, [{ provider: 'ecdict' }]);
  assert.equal(applyCloudTranslation(word, result), false);
  assert.equal(word.vocabularyManualFields?.translation, true);
  assert.equal(applyCloudTranslation(word, { ...result, text: 'wrong' }), false);
});

test('confirmed phrase/sentence translations append and all duplicate source dates retain attribution', () => {
  const records: StudyRecord[] = ['2026-11-03', '2026-11-04'].map(date => ({ date, items: [
    { id: 'words', type: 'englishVocabInteractive', done: true, required: false, minutes: '', f: {
      words: [{ text: 'Hello world!', beautifulSentences: true, translation: '人工原文', vocabularyStars: { card: true } }],
    } },
  ] }));
  const before = vocabularyReviewEntries(records)[0];
  for (const record of records) assert.equal(updateVocabularyWordEntries(record, before.key, { cloudTranslation: { ...result, text: 'Hello world!', translatedText: '你好世界！' } }), true);
  const after = vocabularyReviewEntries(JSON.parse(JSON.stringify(records)))[0];
  assert.ok(after.translation.includes('人工原文') && after.translation.includes('你好世界！'));
  assert.deepEqual(after.cloudTranslationSources, [{ ...result, text: 'Hello world!', translatedText: '你好世界！' }]);
  assert.deepEqual(after.sourceDates, ['2026-11-03', '2026-11-04']);
  assert.equal(after.gsatLevel, null);
});

test('server rejects guests, invalid users, wrong methods and invalid input before reserving quota or calling Google', async () => {
  let reservations = 0, translations = 0;
  const handler = createCloudTranslationHandler(ports({ authenticate: async token => token === 'valid' ? 'verified-user' : null,
    reserve: async () => { reservations += 1; return true; }, translate: async () => { translations += 1; return result; } }));
  assert.equal((await handler(new Request('https://example.test', { method: 'OPTIONS' }))).status, 204);
  assert.equal((await handler(new Request('https://example.test'))).status, 405);
  assert.equal((await handler(new Request('https://example.test', { method: 'POST' }))).status, 401);
  assert.equal((await handler(request('cell', 'invalid'))).status, 401);
  assert.equal((await handler(request('a'.repeat(2001)))).status, 400);
  assert.equal((await handler(request(12))).status, 400);
  assert.equal((await handler(request('a'.repeat(20000)))).status, 413);
  assert.equal(reservations, 0); assert.equal(translations, 0);
});

test('server fails closed for missing configuration, exhausted quota and unavailable quota, without exposing upstream messages', async () => {
  let calls = 0;
  const translate = async (): Promise<CloudTranslation> => { calls += 1; throw new Error('secret API key'); };
  assert.equal((await createCloudTranslationHandler(ports({ configured: () => false, translate }))(request())).status, 503);
  assert.equal((await createCloudTranslationHandler(ports({ reserve: async () => false, translate }))(request())).status, 429);
  const quotaFailure = await createCloudTranslationHandler(ports({ reserve: async () => { throw new Error('database password'); }, translate }))(request());
  assert.equal(quotaFailure.status, 503); assert.equal(calls, 0);
  const upstreamFailure = await createCloudTranslationHandler(ports({ translate }))(request());
  assert.equal(upstreamFailure.status, 502);
  assert.doesNotMatch(await upstreamFailure.text(), /secret|API key/);
  assert.doesNotMatch(await quotaFailure.text(), /password/);
});

test('server quota uses the verified identity and timeout aborts Google without returning stale output', async () => {
  const seen: unknown[] = [];
  const response = await createCloudTranslationHandler(ports({ reserve: async (...args) => { seen.push(args); return true; } }))(request());
  assert.equal(response.status, 200); assert.deepEqual(seen, [['verified-user', 4]]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const timeout = await createCloudTranslationHandler(ports({ translate: (_text, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  }) }), 5)(request());
  assert.equal(timeout.status, 504);
});

test('Google REST bridge sends only the selected English, uses a secret header and fixes the text/language/model options', async () => {
  let called = 0;
  const translated = await requestGoogleTranslation('cell', 'server-only-secret', new AbortController().signal, async (input, init) => {
    called += 1;
    assert.equal(String(input), 'https://translation.googleapis.com/language/translate/v2');
    assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'server-only-secret');
    assert.deepEqual(JSON.parse(String(init?.body)), { q: 'cell', source: 'en', target: 'zh-TW', format: 'text', model: 'nmt' });
    return Response.json({ data: { translations: [{ translatedText: '細胞' }] } });
  });
  assert.equal(called, 1); assert.deepEqual(translated, result);
  await assert.rejects(requestGoogleTranslation('cell', 'key', new AbortController().signal, async () => new Response('leaked-secret', { status: 403 })), /unavailable/);
});

test('client never contacts the endpoint for guests or mismatched sessions', async () => {
  let calls = 0;
  const client = createCloudTranslationClient({ scope: () => scope, session: async () => ({ userId: 'other', accessToken: 'token' }),
    request: async () => { calls += 1; return Response.json({ ok: true, result }); } });
  await assert.rejects(client.translate('cell', 'study-v11:guest:', new AbortController().signal), /登入/);
  await assert.rejects(client.translate('cell', scope, new AbortController().signal), /帳號/);
  assert.equal(calls, 0);
});

test('client checks both record scope and current session after receiving a delayed result', async () => {
  let currentScope = scope, loggedIn = true;
  const client = createCloudTranslationClient({ scope: () => currentScope,
    session: async () => loggedIn ? { userId: 'user-a', accessToken: 'token' } : null,
    request: async () => { currentScope = 'study-v11:guest:'; return Response.json({ ok: true, result }); } });
  await assert.rejects(client.translate('cell', scope, new AbortController().signal), /資料空間/);
  currentScope = scope;
  const logout = createCloudTranslationClient({ scope: () => scope,
    session: async () => loggedIn ? { userId: 'user-a', accessToken: 'token' } : null,
    request: async () => { loggedIn = false; return Response.json({ ok: true, result }); } });
  await assert.rejects(logout.translate('cell', scope, new AbortController().signal), /登入/);
});
