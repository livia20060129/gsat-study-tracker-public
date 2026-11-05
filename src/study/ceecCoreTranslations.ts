import { CEEC_MEANING_ROWS } from '../data/ceecCompactTranslations.ts';
import { CEEC_PART_FIELDS, ceecWordIndex } from './ceecReferenceIndex.ts';
import type { VocabularyTranslations } from '../types.ts';

let offsets: number[] | undefined;
const cache = new Map<number, VocabularyTranslations>();

/** Keep the offline core as text; decode only the requested word, never all meaning objects at startup. */
export function ceecCoreTranslations(word: string): VocabularyTranslations | null {
  const index = ceecWordIndex(word);
  if (index === undefined) return null;
  let result = cache.get(index);
  if (!result) {
    if (!offsets) {
      offsets = [0];
      for (let next = CEEC_MEANING_ROWS.indexOf('\n'); next >= 0; next = CEEC_MEANING_ROWS.indexOf('\n', next + 1)) offsets.push(next + 1);
    }
    const end = (offsets[index + 1] ?? CEEC_MEANING_ROWS.length + 1) - 1;
    const rows = JSON.parse(CEEC_MEANING_ROWS.slice(offsets[index], end)) as Array<[number, string[]]>;
    if (!rows.length) return null;
    result = Object.fromEntries(rows.map(([part, meanings]) => [CEEC_PART_FIELDS[part], meanings])) as VocabularyTranslations;
    cache.set(index, result);
    if (cache.size > 256) cache.delete(cache.keys().next().value!);
  }
  return Object.fromEntries(Object.entries(result).map(([part, meanings]) => [part, [...meanings!]])) as VocabularyTranslations;
}
