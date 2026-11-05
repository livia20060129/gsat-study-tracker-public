import type { EnglishReviewWordEntry } from '../types.ts';
import { cloudTranslationInput, cloudTranslationResult, cloudTranslationSources, type CloudTranslation } from './cloudTranslation.ts';
import { markVocabularyManualFields } from './vocabularyAutoFill.ts';
import { normalizedVocabularyTranslations, VOCABULARY_PARTS_OF_SPEECH,
  vocabularyTranslationGroups, vocabularyTranslationText, type VocabularyPartOfSpeechField } from './vocabularyTranslationCounts.ts';

export type CloudTranslationTarget = VocabularyPartOfSpeechField | 'unclassified';

/** A confirmed machine translation appends to manual work and never invents a POS or GSAT level. */
export function applyCloudTranslation(word: EnglishReviewWordEntry, selection: CloudTranslation, requestedTarget?: CloudTranslationTarget): boolean {
  const result = cloudTranslationResult(selection);
  const original = cloudTranslationInput(word.text);
  if (!result || !original || original.toLowerCase() !== result.text.toLowerCase()) return false;
  if (requestedTarget !== undefined && requestedTarget !== 'unclassified'
    && !VOCABULARY_PARTS_OF_SPEECH.some(([field]) => field === requestedTarget)) return false;
  const before = JSON.stringify(word);
  if (word.fixedCombination || word.beautifulSentences) {
    const current = String(word.translation ?? '').trim();
    if (!current.split('\n').includes(result.translatedText)) word.translation = [current, result.translatedText].filter(Boolean).join('\n');
  } else {
    const selected = VOCABULARY_PARTS_OF_SPEECH.filter(([field]) => word[field] === true);
    const tags = selected.map(([, label]) => label);
    const groups = vocabularyTranslationGroups(String(word.translation ?? ''), tags, normalizedVocabularyTranslations(word.translationsByPartOfSpeech));
    let target = requestedTarget;
    if (target === undefined) target = selected.length === 1 ? selected[0][0] : 'unclassified';
    const meanings = (groups[target] ?? []).filter(value => value.trim());
    if (!meanings.some(value => value.trim() === result.translatedText)) meanings.push(result.translatedText);
    groups[target] = meanings;
    if (target !== 'unclassified') {
      word[target] = true;
      markVocabularyManualFields(word, [target]);
    }
    word.translationsByPartOfSpeech = groups;
    word.translation = vocabularyTranslationText(groups);
  }
  markVocabularyManualFields(word, ['translation', 'translationsByPartOfSpeech']);
  word.cloudTranslationSources = cloudTranslationSources([...cloudTranslationSources(word.cloudTranslationSources), result]);
  return JSON.stringify(word) !== before;
}
