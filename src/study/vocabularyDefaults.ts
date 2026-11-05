import type { VocabularyTranslations } from '../types.ts';
import { dictionaryQuery } from './dictionaryEntries.ts';
import { loadEcdictTranslations } from './ecdictLookup.ts';
import { loadVocabularyFallbackParts, type VocabularyFallbackParts } from './vocabularyFallbackParts.ts';

export type VocabularyDefaultSource = 'ECDICT' | 'Google Translate';
export interface VocabularyDefaults {
  translations: VocabularyTranslations;
  source: VocabularyDefaultSource;
  parts?: VocabularyFallbackParts;
}

/** A failed local dictionary download is not proof that a word is absent. */
export function createVocabularyDefaultsLoader(
  local: (value: string) => Promise<VocabularyTranslations | null>,
  translate: (word: string) => Promise<string | null>,
  parts: (word: string) => Promise<VocabularyFallbackParts | null> = loadVocabularyFallbackParts,
): (value: string) => Promise<VocabularyDefaults | null> {
  return async function load(value: string): Promise<VocabularyDefaults | null> {
    const translations = await local(value);
    if (translations && Object.values(translations).some(meanings => meanings?.some(meaning => meaning.trim()))) {
      return { translations, source: 'ECDICT' };
    }
    const word = dictionaryQuery(value);
    if (!word || !/^[a-z]+(?:['-][a-z]+)*$/i.test(word)) return null;
    const translation = await translate(word);
    if (!translation) return null;
    const knownParts = await parts(word);
    // One translation cannot be assigned to several distinct senses without evidence.
    const field = knownParts?.parts.length === 1 ? knownParts.parts[0] : 'unclassified';
    return { translations: { [field]: [translation] }, source: 'Google Translate', ...(knownParts ? { parts: knownParts } : {}) };
  };
}

export const loadVocabularyDefaults = createVocabularyDefaultsLoader(loadEcdictTranslations,
  async function explicitGoogleOnly(): Promise<null> {
    // Public users initiate paid requests with the editor's Google button.
    return null;
  });
