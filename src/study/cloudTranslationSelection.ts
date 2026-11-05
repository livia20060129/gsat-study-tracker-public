import type { EnglishReviewWordEntry } from '../types.ts';
import { cloudTranslationInput, cloudTranslationResult, cloudTranslationSources, type CloudTranslation } from './cloudTranslation.ts';
import { markVocabularyManualFields } from './vocabularyAutoFill.ts';
import { normalizedVocabularyTranslations, VOCABULARY_PARTS_OF_SPEECH,
  vocabularyTranslationGroups, vocabularyTranslationText } from './vocabularyTranslationCounts.ts';

/** A confirmed machine translation appends to manual work and never invents a POS or GSAT level. */
export function applyCloudTranslation(word: EnglishReviewWordEntry, selection: CloudTranslation): boolean {
  const result = cloudTranslationResult(selection);
  const original = cloudTranslationInput(word.text);
  if (!result || !original || original.toLowerCase() !== result.text.toLowerCase()) return false;
  const before = JSON.stringify(word);
  if (word.fixedCombination || word.beautifulSentences) {
    const current = String(word.translation ?? '').trim();
    if (!current.split('\n').includes(result.translatedText)) word.translation = [current, result.translatedText].filter(Boolean).join('\n');
  } else {
    const tags = VOCABULARY_PARTS_OF_SPEECH.filter(([field]) => word[field] === true).map(([, label]) => label);
    const groups = vocabularyTranslationGroups(String(word.translation ?? ''), tags, normalizedVocabularyTranslations(word.translationsByPartOfSpeech));
    const unclassified = (groups.unclassified ?? []).filter(value => value.trim());
    if (!unclassified.some(value => value.trim() === result.translatedText)) unclassified.push(result.translatedText);
    groups.unclassified = unclassified;
    word.translationsByPartOfSpeech = groups;
    word.translation = vocabularyTranslationText(groups);
  }
  markVocabularyManualFields(word, ['translation', 'translationsByPartOfSpeech']);
  word.cloudTranslationSources = cloudTranslationSources([...cloudTranslationSources(word.cloudTranslationSources), result]);
  return JSON.stringify(word) !== before;
}
