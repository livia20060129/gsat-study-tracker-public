import assert from 'node:assert/strict';
import test from 'node:test';
import { vocabularyReviewEntries, type VocabularyReviewEntry } from '../src/study/vocabularyReview.ts';
import { vocabularyMeaningGroups } from '../src/study/vocabularyMeaningGroups.ts';
import { vocabularyPrintDocument } from '../src/study/vocabularyPrint.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';

function entries(words: EnglishReviewWordEntry[]): VocabularyReviewEntry[] {
  const record: StudyRecord = { date: '2026-10-24', items: [{ id: 'words', type: 'englishVocabInteractive',
    done: false, minutes: '15', required: false, f: { words } }] };
  return vocabularyReviewEntries([record]);
}

const alternate = { text: 'alternate', noun: true, verb: true, adjective: true,
  translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'], adjective: ['輪流的'] } };

test('each stored meaning has its own row and unselected POS data stays preserved but not displayed', () => {
  const [word] = entries([alternate]);
  assert.deepEqual(vocabularyMeaningGroups(word, '單字'), [
    { partOfSpeech: 'Noun', meanings: ['代替者', '候補者'] },
    { partOfSpeech: 'Verb', meanings: ['輪流'] },
    { partOfSpeech: 'Adjective', meanings: ['輪流的'] },
  ]);
  const original = structuredClone(word);
  word.tags = ['Noun'];
  assert.deepEqual(vocabularyMeaningGroups(word, '單字'), [{ partOfSpeech: 'Noun', meanings: ['代替者', '候補者'] }]);
  assert.deepEqual(word.translationsByPartOfSpeech, original.translationsByPartOfSpeech);
});

test('print table merges English across four rows and Noun across two rows with one Chinese cell per meaning', () => {
  const html = vocabularyPrintDocument(entries([alternate]), '單字', true);
  assert.match(html, /rowspan="4">alternate<\/td>/);
  assert.match(html, /rowspan="2">Noun<\/td>/);
  assert.equal((html.match(/class="meaning"/g) ?? []).length, 4);
  for (const meaning of ['代替者', '候補者', '輪流', '輪流的']) assert.ok(html.includes(`>${meaning}</td>`));
  assert.match(html, /size:A4 portrait/);
  assert.match(html, /thead\{display:table-header-group\}/);
});

test('blank PDF table has the same row spans and answer-cell count without embedding any Chinese answers', () => {
  const words = entries([alternate]);
  const before = structuredClone(words);
  const html = vocabularyPrintDocument(words, '單字', false);
  assert.match(html, /rowspan="4">alternate<\/td>/);
  assert.match(html, /rowspan="2">Noun<\/td>/);
  assert.equal((html.match(/class="meaning">&#160;<\/td>/g) ?? []).length, 4);
  for (const meaning of ['代替者', '候補者', '輪流', '輪流的']) assert.ok(!html.includes(meaning));
  assert.deepEqual(words, before);
});

test('legacy ambiguous translations remain unclassified and empty POS has one blank row', () => {
  const [word] = entries([{ text: 'term', noun: true, verb: true, translation: '術語；條款' }]);
  assert.deepEqual(vocabularyMeaningGroups(word, '單字'), [
    { partOfSpeech: 'Noun', meanings: [''] }, { partOfSpeech: 'Verb', meanings: [''] },
    { partOfSpeech: '未分詞性', meanings: ['術語', '條款'] },
  ]);
});

test('combinations and sentences split meanings without exposing POS, while blank entries retain a writing cell', () => {
  const [phrase] = entries([{ text: 'take off', fixedCombination: true, translation: '起飛；脫下' }]);
  assert.deepEqual(vocabularyMeaningGroups(phrase, '組合'), [{ partOfSpeech: '', meanings: ['起飛', '脫下'] }]);
  const [empty] = entries([{ text: 'Not yet.', beautifulSentences: true }]);
  assert.deepEqual(vocabularyMeaningGroups(empty, '句子'), [{ partOfSpeech: '', meanings: [''] }]);
});

test('HTML export escapes English and Chinese text rather than executing user input', () => {
  const html = vocabularyPrintDocument(entries([{ text: '<img src=x onerror=alert(1)>', noun: true,
    translationsByPartOfSpeech: { noun: ['<script>alert(2)</script>'] } }]), '單字', true);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert(2)'));
  assert.ok(html.includes('&lt;script&gt;alert(2)&lt;/script&gt;'));
});
