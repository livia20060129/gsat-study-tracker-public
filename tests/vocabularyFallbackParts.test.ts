import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ECDICT_FALLBACK_PARTS } from '../src/data/ecdictFallbackParts.ts';
import { loadVocabularyFallbackParts } from '../src/study/vocabularyFallbackParts.ts';
import { createVocabularyDefaultsLoader } from '../src/study/vocabularyDefaults.ts';
import { applyVocabularyAutoFill, markVocabularyManualFields, vocabularyAutoFillSources, vocabularyAutoFillStatus } from '../src/study/vocabularyAutoFill.ts';
import { updateVocabularyWordEntries } from '../src/study/vocabularyReview.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { vocabularyDictionary, vocabularyDictionaryLink } from '../src/ui/vocabularyDictionaryLinks.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';

test('fallback POS data retains source labels, a matching source hash and only supported fields', () => {
  const manifest = JSON.parse(readFileSync(new URL('../public/dictionaries/ecdict-v1/manifest.json', import.meta.url), 'utf8'));
  const source = readFileSync(new URL('../src/data/ecdictFallbackParts.ts', import.meta.url), 'utf8');
  assert.ok(source.includes(manifest.sha256));
  assert.equal(Object.keys(ECDICT_FALLBACK_PARTS).length, 11331);
  const allowed = new Set(['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction', 'pronoun', 'article', 'auxiliary']);
  for (const [word, parts] of Object.entries(ECDICT_FALLBACK_PARTS)) {
    assert.match(word, /^[a-z]+(?:['-][a-z]+)*$/);
    assert.ok(parts.length && parts.every(part => allowed.has(part)));
    assert.equal(parts.length, new Set(parts).size);
  }
});

test('exact local spelling supplies ECDICT or official POS without remote analysis or guessed unknown words', async () => {
  assert.deepEqual(await loadVocabularyFallbackParts('afflation'), { parts: ['noun'], source: 'ECDICT' });
  assert.deepEqual(await loadVocabularyFallbackParts('abecedary'), { parts: ['adjective', 'noun'], source: 'ECDICT' });
  assert.deepEqual(await loadVocabularyFallbackParts('ability'), { parts: ['noun'], source: '大考中心' });
  assert.equal(await loadVocabularyFallbackParts('unlistedword'), null);
});

test('Google Chinese and known POS travel together; multiple POS do not duplicate one gloss into several senses', async () => {
  const loader = createVocabularyDefaultsLoader(async () => null, async () => '補充翻譯');
  assert.deepEqual(await loader('afflation'), { translations: { noun: ['補充翻譯'] }, source: 'Google Translate',
    parts: { parts: ['noun'], source: 'ECDICT' } });
  const multiple = await loader('abecedary');
  assert.deepEqual(multiple?.translations, { unclassified: ['補充翻譯'] });
  assert.deepEqual(multiple?.parts?.parts, ['adjective', 'noun']);
  assert.deepEqual(await loader('unlistedword'), { translations: { unclassified: ['補充翻譯'] }, source: 'Google Translate' });
});

test('ECDICT hits and an unsigned-in Google result skip the optional fallback data lookup', async () => {
  let calls = 0;
  const parts = async () => { calls++; return null; };
  await createVocabularyDefaultsLoader(async () => ({ noun: ['中文'] }), async () => null, parts)('afflation');
  await createVocabularyDefaultsLoader(async () => null, async () => null, parts)('afflation');
  assert.equal(calls, 0);
});

test('automatic POS and its actual local source round-trip while explicit manual choices win', async () => {
  const defaults = (await createVocabularyDefaultsLoader(async () => null, async () => '靈感')('afflation'))!;
  const word: EnglishReviewWordEntry = { id: 'word', text: 'afflation' };
  applyVocabularyAutoFill(word, defaults.translations, defaults.source, defaults.parts);
  assert.equal(word.noun, true);
  assert.equal(word.gsatLevel, undefined);
  assert.deepEqual(vocabularyAutoFillSources(word), { ceec: false, ecdict: true, google: true });
  assert.match(vocabularyAutoFillStatus(word), /ECDICT｜詞性/);
  const record: StudyRecord = { date: '2026-11-05', items: [{ id: 'words', type: 'general', done: false, minutes: '', required: false, f: { words: [word] } }] };
  const copy = decodeStudyRecord(encodeStudyRecord(record));
  assert.equal(copy.ok, true);
  if (!copy.ok) return;
  assert.deepEqual(copy.record.items[0].f.words, [word]);
  word.noun = false;
  markVocabularyManualFields(word, ['noun']);
  word.translation = '手動中文';
  markVocabularyManualFields(word, ['translation']);
  updateVocabularyWordEntries(record, 'afflation', { autoFill: true, autoFillTranslations: defaults.translations,
    autoFillSource: defaults.source, autoFillParts: defaults.parts });
  assert.equal(word.noun, false);
  assert.equal(word.translation, '手動中文');
});

test('dictionary links choose Cambridge Traditional Chinese or Oxford and encode the query safely', () => {
  assert.equal(vocabularyDictionary('unexpected'), 'oxford');
  assert.equal(vocabularyDictionary('cambridge'), 'cambridge');
  assert.equal(vocabularyDictionaryLink('apple', 'cambridge').url, 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/apple');
  assert.match(vocabularyDictionaryLink('alternate', 'oxford').url, /oxford.*q=alternate$/);
  assert.match(vocabularyDictionaryLink('Leverage', 'oxford').url, /q=Leverage$/);
  assert.equal(vocabularyDictionaryLink('', 'cambridge').url, '');
});
