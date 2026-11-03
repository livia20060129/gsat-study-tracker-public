import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { vocabularyPdfDocument } from '../src/study/vocabularyPdf.ts';
import { vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { inspectVocabularyPdf } from './helpers/pdfText.ts';

const fontBytes = await readFile(new URL('../public/fonts/NotoSansTC-Regular.ttf', import.meta.url));
function entries() {
  return vocabularyReviewEntries([{ date: '2026-11-02', items: [{ id: 'words', type: 'englishVocabInteractive', required: false, done: false, minutes: '',
    f: { words: [{ text: 'alternate', noun: true, verb: true, translationsByPartOfSpeech: { noun: ['代替者', '候補者'], verb: ['輪流'] },
      dictionarySources: [{ provider: 'ecdict', word: 'alternate', sourceUrl: 'https://github.com/skywind3000/ECDICT' }] }] } }] }]);
}

test('PDF bytes contain selectable Chinese text, A4 pages and source notices without mutating entries', async () => {
  const words = entries();
  const before = structuredClone(words);
  const bytes = await vocabularyPdfDocument(words, '單字', true, fontBytes);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  const result = await inspectVocabularyPdf(bytes);
  for (const term of ['alternate', 'Noun', 'Verb', '代替者', '候補者', '輪流', 'MIT License']) assert.ok(result.text.includes(term), term);
  assert.ok(Math.abs(result.sizes[0].width - 595.28) < 0.1);
  assert.ok(Math.abs(result.sizes[0].height - 841.89) < 0.1);
  assert.deepEqual(words, before);
});

test('blank PDF retains the table and English but contains no translation text', async () => {
  const bytes = await vocabularyPdfDocument(entries(), '單字', false, fontBytes);
  const { text } = await inspectVocabularyPdf(bytes);
  assert.ok(text.includes('alternate'));
  assert.ok(text.includes('中文翻譯'));
  for (const meaning of ['代替者', '候補者', '輪流']) assert.equal(text.includes(meaning), false);
});

test('multi-page PDF repeats headings and keeps every word and wrapped meaning', async () => {
  const words = Array.from({ length: 45 }, (_, index) => ({ ...entries()[0], key: `word ${index}`, text: `word ${String(index).padStart(2, '0')}` }));
  const bytes = await vocabularyPdfDocument(words, '單字', true, fontBytes);
  const result = await inspectVocabularyPdf(bytes);
  assert.ok(result.pageTexts.length > 1);
  for (const word of words) assert.ok(result.text.includes(word.text), word.text);
  assert.ok(result.pageTexts.filter(text => text.includes('英文\n詞性\n中文翻譯')).length > 1);
});
