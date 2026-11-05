import { dictionaryQuery, ECDICT_SOURCE_URL, type DictionaryLookupResult } from './dictionaryEntries.ts';
import { ecdictTranslations } from './ecdictLookup.ts';
import type { VocabularyTranslations } from '../types.ts';

/** Share ECDICT data with automatic input enrichment. */
export function localDictionaryLookup(value: string, translations: VocabularyTranslations | null = ecdictTranslations(value)): DictionaryLookupResult | null {
  const word = dictionaryQuery(value);
  if (!word) return null;
  if (!translations) return null;
  const meanings = Object.entries(translations).flatMap(([partOfSpeech, values]) => (
    (values ?? []).filter(text => text.trim()).map(text => ({ partOfSpeech: partOfSpeech as keyof typeof translations, text }))
  ));
  return meanings.length ? { provider: 'ecdict', word, sourceUrl: ECDICT_SOURCE_URL, meanings: meanings.slice(0, 40) } : null;
}
