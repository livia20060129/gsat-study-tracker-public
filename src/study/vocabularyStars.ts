import type { VocabularyStars } from '../types.ts';

export interface VocabularyWordToken {
  text: string;
  start: number;
  end: number;
  key: string;
}

function normalizedText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function isVocabularyStarKey(key: string): boolean {
  return key === 'card' || /^(?:word|meaning):.+/.test(key);
}

export function normalizedVocabularyStars(value: unknown): VocabularyStars {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, marked]) => isVocabularyStarKey(key) && typeof marked === 'boolean'));
}

/** Text and same-word occurrence identify tokens independently of surrounding words. */
export function vocabularyWordTokens(text: string): VocabularyWordToken[] {
  const occurrences = new Map<string, number>();
  return [...text.matchAll(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g)].map(match => {
    const word = normalizedText(match[0]).toLowerCase().replace(/’/g, "'");
    const occurrence = occurrences.get(word) ?? 0;
    occurrences.set(word, occurrence + 1);
    return { text: match[0], start: match.index!, end: match.index! + match[0].length,
      key: `word:${encodeURIComponent(word)}:${occurrence}` };
  });
}

/** A meaning is scoped to its POS; deleting another row cannot transfer its star. */
export function vocabularyMeaningStarKeys(partOfSpeech: string, meanings: readonly string[]): string[] {
  const occurrences = new Map<string, number>();
  return meanings.map(meaning => {
    const text = normalizedText(meaning);
    const occurrence = occurrences.get(text) ?? 0;
    occurrences.set(text, occurrence + 1);
    return `meaning:${encodeURIComponent(partOfSpeech)}:${encodeURIComponent(text)}:${occurrence}`;
  });
}

/** Carry stars through an in-place correction, but never through a row deletion or insertion. */
export function remapVocabularyMeaningStars(
  stars: VocabularyStars,
  previous: Record<string, string[]>,
  next: Record<string, string[]>,
  removed?: { partOfSpeech: string; index: number },
): VocabularyStars {
  const result = { ...stars };
  for (const [part, values] of Object.entries(previous)) {
    const updated = next[part];
    if (!updated) continue;
    const beforeKeys = vocabularyMeaningStarKeys(part, values);
    const afterKeys = vocabularyMeaningStarKeys(part, updated);
    if (removed?.partOfSpeech === part && values.length === updated.length + 1
      && removed.index >= 0 && removed.index < values.length) {
      const survivingKeys = beforeKeys.filter((_key, index) => index !== removed.index);
      for (const key of beforeKeys) {
        if (Object.hasOwn(stars, key)) result[key] = false;
      }
      for (const [index, key] of afterKeys.entries()) result[key] = stars[survivingKeys[index]] === true;
      continue;
    }
    if (values.length === updated.length) {
      for (let index = 0; index < beforeKeys.length; index += 1) {
        if (beforeKeys[index] !== afterKeys[index] && Object.hasOwn(stars, beforeKeys[index])) {
          result[afterKeys[index]] = stars[beforeKeys[index]];
        }
      }
    }
    for (const key of beforeKeys) {
      if (!afterKeys.includes(key) && Object.hasOwn(stars, key)) result[key] = false;
    }
  }
  return result;
}
