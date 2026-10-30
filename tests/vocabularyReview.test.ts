import test from 'node:test';
import assert from 'node:assert/strict';
import {
  oxfordLookupQuery,
  oxfordSearchUrl,
  updateVocabularyWordEntries,
  vocabularyReviewEntries,
} from '../src/study/vocabularyReview.ts';
import type { StudyItem, StudyRecord } from '../src/types.ts';

function item(id: string, words: StudyItem['f']['words'], nested: StudyItem[] = []): StudyItem {
  return {
    id,
    type: 'englishVocabInteractive',
    done: false,
    minutes: '',
    required: false,
    f: { words, interactiveEntries: nested },
  };
}

function record(date: string, items: StudyItem[]): StudyRecord {
  return { date, items };
}

test('collects editable words from daily and nested items and sorts them alphabetically', () => {
  const entries = vocabularyReviewEntries([
    record('2026-09-20', [item('later', [{ text: 'novelty', noun: true }])]),
    record('2026-09-19', [item('first', [
      { text: 'pay an insurance premium', fixedCombination: true },
      { text: ' leverage ', verb: true },
    ], [item('nested', [{ text: 'adversity', noun: true }])])]),
  ]);

  assert.deepEqual(entries.map(entry => entry.text), [
    'adversity',
    'leverage',
    'novelty',
    'pay an insurance premium',
  ]);
  assert.deepEqual(entries.find(entry => entry.text === 'adversity')?.sourceDates, ['2026-09-19']);
});

test('merges repeated words without losing parts of speech, translation, dates, or occurrence count', () => {
  const entries = vocabularyReviewEntries([
    record('2026-09-19', [item('one', [{ text: 'Leverage', noun: true, translation: '影響力' }])]),
    record('2026-09-20', [item('two', [{ text: ' leverage ', verb: true, translation: '運用' }])]),
  ]);

  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, 'Leverage');
  assert.equal(entries[0].occurrenceCount, 2);
  assert.deepEqual(entries[0].sourceDates, ['2026-09-19', '2026-09-20']);
  assert.deepEqual(entries[0].tags, ['Noun', 'Verb']);
  assert.deepEqual(entries[0].contentKinds, ['單字']);
  assert.equal(entries[0].translation, '運用');
});

test('keeps combinations and sentences separate from parts of speech', () => {
  const entries = vocabularyReviewEntries([
    record('2026-09-19', [item('kinds', [
      { text: 'pay a premium', fixedCombination: true },
      { text: 'Practice makes perfect.', beautifulSentences: true },
    ])]),
  ]);

  assert.deepEqual(entries[0].contentKinds, ['組合']);
  assert.deepEqual(entries[0].tags, []);
  assert.deepEqual(entries[1].contentKinds, ['句子']);
  assert.deepEqual(entries[1].tags, []);
});

test('updates every matching word occurrence with editable English text, parts of speech, and translation', () => {
  const records = [
    record('2026-09-19', [item('one', [{ text: 'Leverage', noun: true }])]),
    record('2026-09-20', [item('two', [{ text: ' leverage ', verb: true }])]),
  ];
  const partsOfSpeech = new Set<'adjective' | 'verb'>(['verb', 'adjective']);

  assert.equal(updateVocabularyWordEntries(records[0], 'leverage', {
    text: 'Applied leverage',
    partsOfSpeech,
    translation: '運用；影響力',
  }), true);
  assert.equal(updateVocabularyWordEntries(records[1], 'leverage', {
    text: 'Applied leverage',
    partsOfSpeech,
    translation: '運用；影響力',
  }), true);

  const entries = vocabularyReviewEntries(records);
  assert.equal(entries[0].text, 'Applied leverage');
  assert.deepEqual(entries[0].tags, ['Verb', 'Adjective']);
  assert.equal(entries[0].translation, '運用；影響力');
  assert.equal((records[0].items[0].f.words?.[0] as Record<string, unknown>).noun, false);
  assert.equal((records[1].items[0].f.words?.[0] as Record<string, unknown>).text, 'Applied leverage');
});

test('changes every matching occurrence between word, combination, and sentence content kinds', () => {
  const records = [
    record('2026-09-19', [item('one', [{ text: 'well-off', noun: true }])]),
    record('2026-09-20', [item('two', [{ text: ' well-off ', fixedCombination: true }])]),
  ];

  for (const recordEntry of records) {
    assert.equal(updateVocabularyWordEntries(recordEntry, 'well-off', { contentKind: '句子' }), true);
  }
  assert.deepEqual(vocabularyReviewEntries(records)[0].contentKinds, ['句子']);
  for (const recordEntry of records) {
    const word = recordEntry.items[0].f.words?.[0] as Record<string, unknown>;
    assert.equal(word.fixedCombination, false);
    assert.equal(word.beautifulSentences, true);
    assert.equal(updateVocabularyWordEntries(recordEntry, 'well-off', { contentKind: '組合' }), true);
    assert.equal(word.fixedCombination, true);
    assert.equal(word.beautifulSentences, false);
    assert.equal(updateVocabularyWordEntries(recordEntry, 'well-off', { contentKind: '單字' }), true);
    assert.equal(word.fixedCombination, false);
    assert.equal(word.beautifulSentences, false);
  }
  assert.deepEqual(vocabularyReviewEntries(records)[0].contentKinds, ['單字']);
});

test('uses the longest useful English run for an Oxford search link', () => {
  assert.equal(oxfordLookupQuery('leverage + 資源 + to V'), 'leverage');
  assert.equal(oxfordLookupQuery('pay an insurance premium'), 'pay an insurance premium');
  assert.equal(oxfordLookupQuery('v. accomplish'), 'accomplish');
  assert.equal(oxfordSearchUrl('pay an insurance premium'),
    'https://www.oxfordlearnersdictionaries.com/search/english/?q=pay%20an%20insurance%20premium');
  assert.equal(oxfordSearchUrl('純中文備註'), '');
});

test('keeps non-English rows under the fallback group without making an invalid link', () => {
  const entries = vocabularyReviewEntries([
    record('2026-09-19', [item('note', ['純中文備註'])]),
  ]);

  assert.equal(entries[0].letter, '#');
  assert.equal(entries[0].lookupUrl, '');
});
