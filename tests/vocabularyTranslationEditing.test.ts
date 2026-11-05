import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCloudTranslation, type CloudTranslationTarget } from '../src/study/cloudTranslationSelection.ts';
import { updateVocabularyWordEntries, vocabularyReviewEntries } from '../src/study/vocabularyReview.ts';
import { vocabularyMeaningStarKeys } from '../src/study/vocabularyStars.ts';
import { vocabularyDictionaryLink } from '../src/study/vocabularyDictionaryLink.ts';
import { decodeStudyRecord, encodeStudyRecord } from '../src/storage/studyRecordCodec.ts';
import type { EnglishReviewWordEntry, StudyRecord } from '../src/types.ts';

const translation = { provider: 'google-cloud-translation', text: 'intriguing', translatedText: '引人入勝', sourceLanguage: 'en', targetLanguage: 'zh-TW' } as const;
function record(word: EnglishReviewWordEntry): StudyRecord {
  return { date: '2026-11-05', notes: '保留筆記', items: [{ id: 'review', type: 'englishVocabInteractive', done: true, required: false,
    minutes: '25', f: { words: [{ id: 'intriguing', ...word }, { id: 'other', text: 'other', noun: true, translation: '其他' }] } }] };
}

test('a single checked POS receives Google translation without creating an unclassified group', () => {
  const word: EnglishReviewWordEntry = { text: 'intriguing', adjective: true, translationsByPartOfSpeech: { adjective: ['吸引人的', '有趣的'] } };
  assert.equal(applyCloudTranslation(word, translation), true);
  assert.deepEqual(word.translationsByPartOfSpeech, { adjective: ['吸引人的', '有趣的', '引人入勝'] });
  assert.equal(applyCloudTranslation(word, translation), false);
});

test('the explicitly chosen POS is honored without guessing, overwriting meanings or changing other selections', () => {
  const word: EnglishReviewWordEntry = { text: 'intriguing', adjective: true, noun: true, gsatLevel: 3,
    translationsByPartOfSpeech: { adjective: ['原意'], noun: ['另一原意'] }, vocabularyStars: { card: true } };
  assert.equal(applyCloudTranslation(word, translation, 'adjective'), true);
  assert.deepEqual(word.translationsByPartOfSpeech, { adjective: ['原意', '引人入勝'], noun: ['另一原意'] });
  assert.equal(word.noun, true);
  assert.equal(word.gsatLevel, 3);
  assert.deepEqual(word.vocabularyStars, { card: true });
  const untagged: EnglishReviewWordEntry = { text: 'intriguing' };
  assert.equal(applyCloudTranslation(untagged, translation, 'adjective'), true);
  assert.equal(untagged.adjective, true);
  assert.equal(untagged.vocabularyManualFields?.adjective, true);
  const before = structuredClone(untagged);
  assert.equal(applyCloudTranslation(untagged, translation, 'invented' as CloudTranslationTarget), false);
  assert.deepEqual(untagged, before);
});

test('deleting the final unclassified meaning clears its group, free-text backup and its star, retaining unrelated study data', () => {
  const oldStar = vocabularyMeaningStarKeys('未分詞性', ['引人入勝'])[0];
  const adjectiveStar = vocabularyMeaningStarKeys('Adjective', ['吸引人的'])[0];
  const source = record({ text: 'intriguing', adjective: true, translation: 'Adjective：吸引人的；引人入勝',
    translationsByPartOfSpeech: { adjective: ['吸引人的'], unclassified: ['引人入勝'] },
    cloudTranslationSources: [translation], vocabularyStars: { card: true, [oldStar]: true, [adjectiveStar]: true } });
  assert.equal(updateVocabularyWordEntries(source, 'intriguing', { translationsByPartOfSpeech: { adjective: ['吸引人的'] },
    translationRemoval: { field: 'unclassified', index: 0 } }), true);
  const word = source.items[0].f.words![0] as EnglishReviewWordEntry;
  assert.deepEqual(word.translationsByPartOfSpeech, { adjective: ['吸引人的'] });
  assert.equal(word.translation, 'Adjective：吸引人的');
  assert.equal(word.vocabularyStars?.[oldStar], false);
  assert.equal(word.vocabularyStars?.[adjectiveStar], true);
  assert.equal(word.vocabularyStars?.card, true);
  assert.deepEqual(word.cloudTranslationSources, [translation]);
  updateVocabularyWordEntries(source, 'intriguing', { autoFill: true });
  assert.equal(word.translationsByPartOfSpeech?.unclassified, undefined);
  const restored = decodeStudyRecord(encodeStudyRecord(source));
  assert.ok(restored.ok);
  if (restored.ok) assert.equal(vocabularyReviewEntries([restored.record])[0].translationsByPartOfSpeech.unclassified, undefined);
  assert.equal(source.notes, '保留筆記');
  assert.equal(source.items[0].minutes, '25');
  assert.equal(source.items[0].done, true);
  assert.deepEqual(source.items[0].f.words![1], { id: 'other', text: 'other', noun: true, translation: '其他' });
});

test('an untagged legacy word can delete its only meaning without resurrecting it from the free-text fallback', () => {
  const source = record({ text: 'intriguing', translation: '舊翻譯' });
  assert.equal(updateVocabularyWordEntries(source, 'intriguing', { translationsByPartOfSpeech: {}, translationRemoval: { field: 'unclassified', index: 0 } }), true);
  const entry = vocabularyReviewEntries([source])[0];
  assert.equal(entry.translation, '');
  assert.deepEqual(entry.translationsByPartOfSpeech, {});
});

test('dictionary destinations use the chosen official provider and encode phrases as data', () => {
  assert.equal(vocabularyDictionaryLink('intriguing', 'cambridge').url, 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/intriguing');
  assert.equal(vocabularyDictionaryLink('look after', 'oxford').url, 'https://www.oxfordlearnersdictionaries.com/search/english/?q=look%20after');
  assert.equal(vocabularyDictionaryLink('a/b?x', 'cambridge').url, 'https://dictionary.cambridge.org/dictionary/english-chinese-traditional/a%2Fb%3Fx');
  assert.equal(vocabularyDictionaryLink('', 'oxford').url, '');
});
