import assert from 'node:assert/strict';
import test from 'node:test';
import { isVocabularyLookupPending, markVocabularyLookupPending } from '../src/study/vocabularyLookupLifecycle.ts';
import { applyVocabularyAutoFill, markVocabularyManualFields } from '../src/study/vocabularyAutoFill.ts';
import { updateVocabularyWordEntries, vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';

test('only exact edited words carry resumable jobs and a stale spelling cannot schedule another word', () => {
  const word: EnglishReviewWordEntry = { text: ' Intriguing ' };
  markVocabularyLookupPending(word);
  assert.equal(word.vocabularyLookupPending, 'intriguing');
  assert.equal(isVocabularyLookupPending(word), true);
  word.text = 'ability';
  assert.equal(isVocabularyLookupPending(word), false);
  for (const variant of [{ text: 'two words' }, { text: 'intriguing', fixedCombination: true },
    { text: 'intriguing', beautifulSentences: true }]) {
    const entry: EnglishReviewWordEntry = { ...variant, vocabularyLookupPending: 'intriguing' };
    markVocabularyLookupPending(entry);
    assert.equal(entry.vocabularyLookupPending, undefined);
  }
});

test('pending jobs survive serialization while reading old words remains read-only', () => {
  const word: EnglishReviewWordEntry = { text: 'intriguing' };
  markVocabularyLookupPending(word);
  const record: StudyRecord = { date: '2026-11-05', items: [{ id: 'words', type: 'general', done: false, minutes: '', required: false,
    f: { words: [word, { text: 'novelty' }] } }] };
  const decoded = decodeStudyRecord(encodeStudyRecord(record));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  const before = JSON.stringify(decoded.record);
  const entries = vocabularyReviewEntries([decoded.record]);
  assert.equal(entries.find(entry => entry.key === 'intriguing')?.lookupPending, true);
  assert.equal(entries.find(entry => entry.key === 'novelty')?.lookupPending, undefined);
  assert.equal(JSON.stringify(decoded.record), before);
});

test('a successful lookup acknowledges a job even when manual choices prohibit replacing its fields', () => {
  const word: EnglishReviewWordEntry = { text: 'intriguing', adjective: false, translation: '我自己的意思' };
  markVocabularyLookupPending(word);
  markVocabularyManualFields(word, ['adjective', 'translation']);
  applyVocabularyAutoFill(word, { adjective: ['吸引人的', '有趣的'] });
  assert.equal(word.vocabularyLookupPending, undefined);
  assert.equal(word.adjective, false);
  assert.equal(word.translation, '我自己的意思');
  const unknown: EnglishReviewWordEntry = { text: 'unlistedword' };
  markVocabularyLookupPending(unknown);
  applyVocabularyAutoFill(unknown);
  assert.equal(isVocabularyLookupPending(unknown), true);
});

test('explicit review renames can resume after navigation and switching to combinations cancels the job', () => {
  const record: StudyRecord = { date: '2026-11-05', items: [{ id: 'words', type: 'general', done: false, minutes: '', required: false,
    f: { words: [{ id: 'word', text: 'ability' }] } }] };
  updateVocabularyWordEntries(record, 'ability', { text: 'intriguing' });
  const word = record.items[0].f.words![0] as EnglishReviewWordEntry;
  assert.equal(isVocabularyLookupPending(word), true);
  updateVocabularyWordEntries(record, 'intriguing', { contentKind: '組合' });
  assert.equal(word.vocabularyLookupPending, undefined);
});

test('explicit manual Chinese completes a pending job, including an intentionally blank answer', () => {
  for (const translation of ['手動中文', '']) {
    const word: EnglishReviewWordEntry = { text: 'intriguing' };
    markVocabularyLookupPending(word);
    const record: StudyRecord = { date: '2026-11-05', items: [{ id: 'words', type: 'general', done: false, minutes: '', required: false, f: { words: [word] } }] };
    updateVocabularyWordEntries(record, 'intriguing', { translation });
    assert.equal(word.vocabularyLookupPending, undefined);
    assert.equal(word.translation, translation);
  }
});
