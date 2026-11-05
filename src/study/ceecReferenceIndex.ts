import { CEEC_LEVEL_MASKS, CEEC_PART_CODES, CEEC_WORD_INDEX } from '../data/ceecCompactIndex.ts';
import type { GsatVocabularyLevel } from '../types.ts';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export const CEEC_PART_FIELDS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction',
  'pronoun', 'article', 'auxiliary', 'interjection', 'unclassified'] as const;
let indices: Map<string, number> | undefined;
let partsByWord: string[] | undefined;

export function ceecWordIndex(word: string): number | undefined {
  indices ??= new Map(CEEC_WORD_INDEX.split('\n').map((value, index) => [value, index]));
  return indices.get(word);
}

export function ceecReferenceMetadata(word: string): { level: GsatVocabularyLevel; levels: number[]; parts: string[] } | null {
  const index = ceecWordIndex(word);
  if (index === undefined) return null;
  const levelMask = BASE64.indexOf(CEEC_LEVEL_MASKS[index]);
  const levels = [1, 2, 3, 4, 5, 6].filter(level => levelMask & (1 << (level - 1)));
  partsByWord ??= CEEC_PART_CODES.split('|');
  return { level: levels[0] as GsatVocabularyLevel, levels,
    parts: [...partsByWord[index]].map(code => CEEC_PART_FIELDS[BASE64.indexOf(code)]) };
}
