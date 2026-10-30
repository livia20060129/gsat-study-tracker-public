import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CEEC_VOCABULARY } from '../src/data/ceecVocabulary.ts';
import { CEEC_TRANSLATIONS } from '../src/data/ceecTranslations.ts';
import { ECDICT_MIT_LICENSE } from '../src/data/vocabularyLicenses.ts';
import { applyVocabularyAutoFill, vocabularyAutoFillSources, vocabularyAutoFillStatus, vocabularyReference } from '../src/study/vocabularyAutoFill.ts';
import { VOCABULARY_PARTS_OF_SPEECH, vocabularyTranslationText } from '../src/study/vocabularyTranslationCounts.ts';
import { updateVocabularyWordEntries, vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { vocabularyPrintDocument } from '../src/study/vocabularyPrint.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import { mergeStudyRecordsThreeWay } from '../src/storage/recordSync.ts';
import { parseProgressImportText } from '../src/application/progressImport.ts';
import type { EnglishReviewWordEntry, StudyRecord, VocabularyTranslations } from '../src/types.ts';

function word(text = 'ability'): EnglishReviewWordEntry { return { id: 'stable', text }; }
function record(entry: EnglishReviewWordEntry): StudyRecord {
  return { date: '2026-10-24', items: [{ id: 'review', type: 'englishVocabInteractive', done: false, minutes: '15', required: false, f: { words: [entry] } }] };
}

test('the compiled official list and licensed translations have complete, internally valid indices', () => {
  assert.equal(Object.keys(CEEC_VOCABULARY).length, 6191);
  assert.equal(Object.keys(CEEC_TRANSLATIONS).length, 6155);
  const fields = new Set<string>(VOCABULARY_PARTS_OF_SPEECH.map(([field]) => field));
  for (const entry of Object.values(CEEC_VOCABULARY)) {
    assert.equal(entry.level, Math.min(...entry.levels));
    assert.ok(entry.levels.every(level => level >= 1 && level <= 6));
    assert.ok(entry.parts.length && entry.parts.every(part => fields.has(part)));
  }
  for (const [key, groups] of Object.entries(CEEC_TRANSLATIONS)) {
    assert.ok(Object.hasOwn(CEEC_VOCABULARY, key));
    for (const [field, meanings] of Object.entries(groups)) {
      assert.ok(CEEC_VOCABULARY[key].parts.includes(field));
      assert.ok(meanings!.length && meanings!.every(meaning => /[\u3400-\u9fff]/.test(meaning)));
    }
  }
});

test('officially listed aliases, derived nouns, plurals and multiple levels are distinguished correctly', () => {
  assert.deepEqual(vocabularyReference('agreement')!.parts, ['noun']);
  assert.equal(vocabularyReference('agreement')!.level, 1);
  assert.deepEqual(vocabularyReference('ad')!.parts, ['noun']);
  assert.equal(vocabularyReference('capitalism')!.level, 4);
  assert.equal(vocabularyReference('capital')!.level, 2);
  assert.deepEqual(vocabularyReference('comics')!.parts, ['noun']);
  assert.deepEqual(vocabularyReference('measure')!.levels, [2, 4]);
  assert.equal(vocabularyReference('measure')!.level, 2);
  for (const input of ['novelty', 'Monday', 'ability notes', 'abilities', '__proto__', 'constructor', '']) {
    assert.equal(vocabularyReference(input), null, input);
  }
  assert.equal(vocabularyReference('  ABILITY  ')!.level, 1);
});

test('new words receive separate traditional meanings, official POS and a visible Level without changing their ID', () => {
  const entry = word();
  assert.equal(applyVocabularyAutoFill(entry), true);
  assert.equal(entry.id, 'stable');
  assert.equal(entry.noun, true);
  assert.equal(entry.verb, false);
  assert.equal(entry.gsatLevel, 1);
  assert.equal(entry.showGsatLevel, true);
  assert.deepEqual(entry.translationsByPartOfSpeech, { noun: ['能力', '才幹'] });
  assert.equal(entry.translation, 'Noun：能力、才幹');
  assert.equal(applyVocabularyAutoFill(entry), false);
});

test('article, pronoun and auxiliary classifications are not incorrectly treated as nouns or verbs', () => {
  for (const [text, field] of [['the', 'article'], ['you', 'pronoun'], ['may', 'auxiliary']]) {
    const entry = word(text);
    applyVocabularyAutoFill(entry);
    assert.equal(entry[field], true);
    assert.equal(entry.noun, false);
  }
});

test('existing manual translation, POS, Level and disabled visibility are not replaced', () => {
  const entry = { ...word('abandon'), noun: true, verb: false, gsatLevel: 2 as const,
    showGsatLevel: false, translation: '我的中文', translationsByPartOfSpeech: { noun: ['我的中文'] } };
  applyVocabularyAutoFill(entry);
  assert.equal(entry.noun, true);
  assert.equal(entry.verb, false);
  assert.equal(entry.gsatLevel, 2);
  assert.equal(entry.showGsatLevel, false);
  assert.deepEqual(entry.translationsByPartOfSpeech, { noun: ['我的中文'] });
});

test('manual edits including an intentionally empty translation stay protected on repeated matching', () => {
  const entry = word();
  applyVocabularyAutoFill(entry);
  entry.noun = false;
  entry.showGsatLevel = false;
  entry.gsatLevel = 6;
  entry.translationsByPartOfSpeech!.noun = [''];
  entry.translation = '';
  for (let i = 0; i < 3; i++) applyVocabularyAutoFill(entry);
  assert.equal(entry.noun, false);
  assert.equal(entry.showGsatLevel, false);
  assert.equal(entry.gsatLevel, 6);
  assert.deepEqual(entry.translationsByPartOfSpeech, { noun: [''] });
});

test('changing English replaces only earlier automatic data and clears it when the new spelling is not listed', () => {
  const entry = word();
  applyVocabularyAutoFill(entry);
  entry.text = 'abandon';
  applyVocabularyAutoFill(entry);
  assert.equal(entry.verb, true);
  assert.equal(entry.noun, false);
  assert.equal(entry.gsatLevel, 4);
  assert.ok(entry.translationsByPartOfSpeech!.verb!.includes('放棄'));
  entry.text = 'not-an-official-word';
  applyVocabularyAutoFill(entry);
  assert.equal(entry.gsatLevel, undefined);
  assert.equal(entry.translationsByPartOfSpeech, undefined);
  assert.equal(entry.id, 'stable');
});

test('combinations, sentences and unknown words are never automatically enriched', () => {
  for (const entry of [word('unknown-test-term'), { ...word(), fixedCombination: true }, { ...word(), beautifulSentences: true }]) {
    const before = structuredClone(entry);
    assert.equal(applyVocabularyAutoFill(entry), false);
    assert.deepEqual(entry, before);
  }
});

test('an intentionally cleared meaning stays cleared through an unlisted intermediate spelling', () => {
  const entry = word();
  applyVocabularyAutoFill(entry);
  entry.translationsByPartOfSpeech = { noun: [''] };
  entry.translation = '';
  entry.showGsatLevel = false;
  entry.text = 'unlisted-test-word';
  applyVocabularyAutoFill(entry);
  assert.equal(vocabularyAutoFillSources(entry)!.ceec, false);
  entry.text = 'ability';
  applyVocabularyAutoFill(entry);
  assert.deepEqual(entry.translationsByPartOfSpeech, { noun: [''] });
  assert.equal(entry.translation, '');
  assert.equal(entry.showGsatLevel, false);
});

test('missing dictionary meanings remain blank and the source status identifies the gap', () => {
  const entry = word('alternate');
  applyVocabularyAutoFill(entry);
  assert.equal(entry.noun, true);
  assert.equal(entry.translationsByPartOfSpeech!.noun, undefined);
  assert.match(vocabularyAutoFillStatus(entry), /部分詞性尚無對應翻譯/);
  entry.text = 'measure';
  applyVocabularyAutoFill(entry);
  assert.match(vocabularyAutoFillStatus(entry), /Level 2／Level 4（自動帶入較低級）/);
});

test('vocabulary-page renaming enriches nested records while read-only collection never mutates older data', () => {
  const source = record(word('new-test-word'));
  source.items[0].f.reviewEntries = [record(word('new-test-word')).items[0]];
  const before = structuredClone(source);
  vocabularyReviewEntries([source]);
  assert.deepEqual(source, before);
  updateVocabularyWordEntries(source, 'new-test-word', { text: 'ability' });
  const entries = vocabularyReviewEntries([source]);
  assert.equal(entries[0].gsatLevel, 1);
  assert.deepEqual(entries[0].translationsByPartOfSpeech, { noun: ['能力', '才幹'] });
  assert.deepEqual(entries[0].referenceSources, { ceec: true, ecdict: true });
  assert.equal(source.items[0].minutes, '15');
});

test('codec, export/import and non-overlapping record merges preserve auto provenance and new POS', () => {
  const entry = word('you');
  applyVocabularyAutoFill(entry);
  const source = record(entry);
  const decoded = decodeStudyRecord(encodeStudyRecord(source));
  assert.equal(decoded.ok, true);
  if (decoded.ok) assert.deepEqual(decoded.record.items[0].f.words, source.items[0].f.words);
  const imported = parseProgressImportText(JSON.stringify({ records: [source] }));
  assert.equal(imported.ok, true);
  const base = structuredClone(source);
  const local = structuredClone(base);
  const cloud = structuredClone(base);
  const localWord = local.items[0].f.words![0] as EnglishReviewWordEntry;
  localWord.translationsByPartOfSpeech!.pronoun = ['您'];
  localWord.translation = vocabularyTranslationText(localWord.translationsByPartOfSpeech!);
  (cloud.items[0].f.words![0] as EnglishReviewWordEntry).showGsatLevel = false;
  const result = mergeStudyRecordsThreeWay(local, cloud, base);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual((result.record.items[0].f.words![0] as EnglishReviewWordEntry).translationsByPartOfSpeech, { pronoun: ['您'] });
  assert.equal((result.record.items[0].f.words![0] as EnglishReviewWordEntry).showGsatLevel, false);
});

test('attribution and the full license accompany translated PDF output but blank PDF contains no answers', () => {
  assert.equal(readFileSync(new URL('../public/licenses/ECDICT-MIT.txt', import.meta.url), 'utf8').trim(), ECDICT_MIT_LICENSE);
  const entry = word();
  applyVocabularyAutoFill(entry);
  assert.deepEqual(vocabularyAutoFillSources(entry), { ceec: true, ecdict: true });
  const entries = vocabularyReviewEntries([record(entry)]);
  const translated = vocabularyPrintDocument(entries, '單字', true);
  assert.match(translated, /Copyright \(c\) 2025 Linwei/);
  assert.match(translated, /大學入學考試中心/);
  const blank = vocabularyPrintDocument(entries, '單字', false);
  assert.ok(!blank.includes('能力'));
  assert.ok(!blank.includes('才幹'));
  assert.match(blank, /大學入學考試中心/);
  const detached = structuredClone(vocabularyReference('ability')!.translations) as VocabularyTranslations;
  detached.noun!.push('不應污染來源');
  assert.deepEqual(vocabularyReference('ability')!.translations.noun, ['能力', '才幹']);
});
