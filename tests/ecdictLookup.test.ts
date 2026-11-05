import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CEEC_TRANSLATIONS } from '../src/data/ceecTranslations.ts';
import { createEcdictLookup, loadEcdictTranslations } from '../src/study/ecdictLookup.ts';
import { applyVocabularyAutoFill, markVocabularyManualFields, vocabularyAutoFillSources } from '../src/study/vocabularyAutoFill.ts';
import type { EnglishReviewWordEntry, VocabularyTranslations } from '../src/types.ts';

const novelty = { noun: ['新奇', '新鮮', '新奇的事物'] };

test('extended lookup coalesces concurrent requests and returns detached results without downloading core words', async () => {
  const requested: string[] = [];
  const lookup = createEcdictLookup(async function fetchData(url) {
    requested.push(url);
    return { ok: true, async json() { return { novelty }; } };
  }, '/tracker/');
  assert.deepEqual(await lookup.load('ability'), { noun: ['能力', '才幹'] });
  assert.equal(requested.length, 0);
  const [first, second] = await Promise.all([lookup.load('Novelty'), lookup.load('novelty')]);
  assert.match(requested[0], /^\/tracker\/dictionaries\/ecdict-v1\/[0-9a-f]{2}\.json$/);
  assert.equal(requested.length, 1);
  assert.deepEqual(first, novelty);
  first!.noun!.push('使用者修改');
  assert.deepEqual(second, novelty);
  assert.deepEqual(lookup.find('novelty'), novelty);
  assert.equal(await lookup.load('__proto__'), null);
  assert.equal(requested.length, 1);
});

test('unavailable dictionary data can be retried and is not cached as a missing spelling', async () => {
  let calls = 0;
  const lookup = createEcdictLookup(async function fetchData() {
    calls++;
    return { ok: calls > 1, async json() { return { novelty }; } };
  }, '/');
  await assert.rejects(lookup.load('novelty'), /temporarily unavailable/);
  assert.deepEqual(await lookup.load('novelty'), novelty);
  assert.equal(calls, 2);
});

test('concurrent extended queries retain their response when more than eight buckets finish together', async () => {
  const words = ['novelty', 'practitioner', 'adored', 'adulation', 'rigidity', 'intergenerational',
    'perpetuation', 'impregnable', 'counterproductive', 'unfathomable', 'palatable', 'exorbitant']
    .filter(word => !Object.hasOwn(CEEC_TRANSLATIONS, word));
  assert.ok(words.length > 8);
  let release = function (): void {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  const values = Object.fromEntries(words.map(word => [word, { noun: ['測試翻譯'] }]));
  const lookup = createEcdictLookup(async function fetchTogether() {
    await gate;
    return { ok: true, async json() { return values; } };
  }, '/');
  const requests = words.map(word => lookup.load(word));
  release();
  const results = await Promise.all(requests);
  for (const [index, word] of words.entries()) assert.deepEqual(results[index], values[word], word);
});

test('shipped extended shards enrich unlisted English with ECDICT POS and Chinese without inventing a Level', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function fetchDictionary(url): Promise<Response> {
    const path = String(url).replace(/^\//, '');
    return new Response(readFileSync(new URL('../public/' + path, import.meta.url), 'utf8'));
  };
  try {
    assert.deepEqual(await loadEcdictTranslations('novelty'), novelty);
    const entry: EnglishReviewWordEntry = { id: 'stable', text: 'novelty' };
    assert.equal(applyVocabularyAutoFill(entry), true);
    assert.deepEqual(entry.translationsByPartOfSpeech, novelty);
    assert.equal(entry.noun, true);
    assert.equal(entry.gsatLevel, undefined);
    assert.equal(entry.showGsatLevel, undefined);
    assert.deepEqual(vocabularyAutoFillSources(entry), { ceec: false, ecdict: true });
    entry.translationsByPartOfSpeech = { noun: ['我的中文'] };
    entry.translation = '我的中文';
    entry.noun = false;
    markVocabularyManualFields(entry, ['noun', 'translation', 'translationsByPartOfSpeech']);
    applyVocabularyAutoFill(entry);
    assert.equal(entry.noun, false);
    assert.deepEqual(entry.translationsByPartOfSpeech, { noun: ['我的中文'] });
  } finally { globalThis.fetch = originalFetch; }
});

test('manual false and blank values made before a dictionary response stay protected', () => {
  const entry: EnglishReviewWordEntry = { text: 'ability', noun: false, translation: '', translationsByPartOfSpeech: { noun: [''] } };
  markVocabularyManualFields(entry, ['noun', 'translation', 'translationsByPartOfSpeech']);
  applyVocabularyAutoFill(entry);
  assert.equal(entry.noun, false);
  assert.equal(entry.translation, '');
  assert.deepEqual(entry.translationsByPartOfSpeech, { noun: [''] });
});

test('extended deployment data has bounded shards, valid Chinese rows and exact core correspondence', () => {
  const root = new URL('../public/dictionaries/ecdict-v1/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  let count = 0, totalBytes = 0, maxBytes = 0, coreCount = 0;
  for (let bucket = 0; bucket < 256; bucket++) {
    const payload = readFileSync(new URL(bucket.toString(16).padStart(2, '0') + '.json', root));
    totalBytes += payload.length;
    maxBytes = Math.max(maxBytes, payload.length);
    const entries = JSON.parse(payload.toString()) as Record<string, VocabularyTranslations>;
    count += Object.keys(entries).length;
    for (const [word, groups] of Object.entries(entries)) {
      assert.ok(Object.values(groups).every(values => values!.length && values!.every(value => /[\u3400-\u9fff]/.test(value))));
      if (Object.hasOwn(CEEC_TRANSLATIONS, word)) {
        assert.deepEqual(groups, CEEC_TRANSLATIONS[word]);
        coreCount++;
      }
    }
  }
  assert.equal(count, manifest.entries);
  assert.equal(totalBytes, manifest.totalBytes);
  assert.equal(maxBytes, manifest.maxShardBytes);
  assert.ok(maxBytes < 200_000);
  assert.equal(coreCount, manifest.coreEntries);
});
