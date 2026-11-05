import { ceecReferenceMetadata } from './ceecReferenceIndex.ts';
import type { EnglishReviewPartOfSpeech } from '../types.ts';
import { VOCABULARY_PARTS_OF_SPEECH } from './vocabularyTranslationCounts.ts';

export interface VocabularyFallbackParts {
  parts: EnglishReviewPartOfSpeech[];
  source: 'ECDICT' | '大考中心';
}

/** Read labels from published local data; translation text is never used to infer POS. */
export async function loadVocabularyFallbackParts(word: string): Promise<VocabularyFallbackParts | null> {
  const reference = ceecReferenceMetadata(word);
  const parts = VOCABULARY_PARTS_OF_SPEECH.map(([field]) => field).filter(field => reference?.parts.includes(field));
  if (parts.length) return { parts, source: '大考中心' };
  try {
    const { ECDICT_FALLBACK_PARTS } = await import('../data/ecdictFallbackParts.ts');
    if (Object.hasOwn(ECDICT_FALLBACK_PARTS, word)) return { parts: [...ECDICT_FALLBACK_PARTS[word]], source: 'ECDICT' };
  } catch { /* A failed optional POS download must not discard a completed Chinese translation. */ }
  return null;
}
