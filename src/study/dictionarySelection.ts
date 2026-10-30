import type { EnglishReviewWordEntry } from '../types.ts';
import { dictionaryResult, dictionarySource, type DictionaryLookupResult, type DictionarySourceReference } from './dictionaryEntries.ts';
import { normalizedVocabularyTranslations, VOCABULARY_PARTS_OF_SPEECH, vocabularyTranslationText, vocabularyTranslationGroups } from './vocabularyTranslationCounts.ts';

export function dictionarySources(value: unknown): DictionarySourceReference[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, DictionarySourceReference>();
  for (const entry of value.slice(-64)) {
    const source = dictionarySource(entry);
    if (source) unique.set(`${source.provider}:${source.word}:${source.sourceUrl}`, source);
  }
  return [...unique.values()].slice(-8);
}

/** Confirmation appends selected senses per occurrence; never replaces manual meanings or GSAT Level. */
export function applyDictionarySelection(word: EnglishReviewWordEntry, selection: DictionaryLookupResult): boolean {
  const result = dictionaryResult(selection, String(word.text ?? ''));
  if (!result || word.fixedCombination || word.beautifulSentences) return false;
  const before = JSON.stringify(word);
  const tags = VOCABULARY_PARTS_OF_SPEECH.filter(([field]) => word[field] === true).map(([, label]) => label);
  const groups = vocabularyTranslationGroups(String(word.translation ?? ''), tags, normalizedVocabularyTranslations(word.translationsByPartOfSpeech));
  for (const meaning of result.meanings) {
    const values = (groups[meaning.partOfSpeech] ?? []).filter(value => value.trim());
    if (!values.some(value => value.trim() === meaning.text)) values.push(meaning.text);
    groups[meaning.partOfSpeech] = values;
    if (meaning.partOfSpeech !== 'unclassified') word[meaning.partOfSpeech] = true;
  }
  word.translationsByPartOfSpeech = groups;
  word.translation = vocabularyTranslationText(groups);
  const source = { provider: result.provider, word: result.word, sourceUrl: result.sourceUrl };
  word.dictionarySources = dictionarySources([...dictionarySources(word.dictionarySources), source]);
  return JSON.stringify(word) !== before;
}
