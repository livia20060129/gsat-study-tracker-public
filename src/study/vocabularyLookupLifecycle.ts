import { dictionaryQuery } from './dictionaryEntries.ts';
import type { EnglishReviewWordEntry } from '../types.ts';

function lookupWord(word: EnglishReviewWordEntry): string {
  if (word.fixedCombination || word.beautifulSentences) return '';
  const query = dictionaryQuery(word.text);
  if (!query) return '';
  return /^[a-z]+(?:['-][a-z]+)*$/.test(query) ? query : '';
}

/** Only explicitly edited words become jobs; opening old history never schedules a bulk rewrite. */
export function markVocabularyLookupPending(word: EnglishReviewWordEntry): void {
  const query = lookupWord(word);
  if (query) word.vocabularyLookupPending = query;
  else delete word.vocabularyLookupPending;
}

export function isVocabularyLookupPending(word: EnglishReviewWordEntry): boolean {
  return typeof word.vocabularyLookupPending === 'string'
    && word.vocabularyLookupPending !== '' && word.vocabularyLookupPending === lookupWord(word);
}
