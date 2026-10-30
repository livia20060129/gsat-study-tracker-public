import { dictionaryQuery, ECDICT_SOURCE_URL, type DictionaryLookupResult } from './dictionaryEntries.ts';
import { vocabularyReference } from './vocabularyAutoFill.ts';

/** Reuse the shipped CEEC/ECDICT subset without downloading a second dictionary. */
export function localDictionaryLookup(value: string): DictionaryLookupResult | null {
  const word = dictionaryQuery(value);
  if (!word) return null;
  const reference = vocabularyReference(word);
  if (!reference) return null;
  const meanings = Object.entries(reference.translations).flatMap(([partOfSpeech, values]) => (
    (values ?? []).filter(text => text.trim()).map(text => ({ partOfSpeech: partOfSpeech as keyof typeof reference.translations, text }))
  ));
  return meanings.length ? { provider: 'ecdict', word, sourceUrl: ECDICT_SOURCE_URL, meanings: meanings.slice(0, 40) } : null;
}
