import { cambridgeDictionaryUrl, dictionaryQuery } from '../study/dictionaryEntries.ts';
import { oxfordSearchUrl } from '../study/vocabularyReview.ts';

export type VocabularyDictionary = 'oxford' | 'cambridge';
export const VOCABULARY_DICTIONARY_KEY = 'study-v11:vocabulary:dictionary';

export function vocabularyDictionary(value: unknown): VocabularyDictionary {
  return value === 'cambridge' ? 'cambridge' : 'oxford';
}

export function vocabularyDictionaryLink(value: unknown, provider: VocabularyDictionary): { url: string; name: string } {
  const query = dictionaryQuery(value);
  if (provider === 'cambridge') return { url: query ? cambridgeDictionaryUrl(query) : '', name: '劍橋英漢辭典' };
  return { url: oxfordSearchUrl(value), name: 'Oxford Learner\'s Dictionaries' };
}
