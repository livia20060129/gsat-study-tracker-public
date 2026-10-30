export type DictionaryProvider = 'ecdict';
/** The retired provider is accepted only when reading attribution already stored in old records. */
export type DictionarySourceProvider = DictionaryProvider | 'cambridge';
export type DictionaryPartOfSpeech = typeof DICTIONARY_PARTS[number];
export interface DictionaryMeaning {
  partOfSpeech: DictionaryPartOfSpeech;
  text: string;
}
export interface DictionarySourceReference {
  provider: DictionarySourceProvider;
  word: string;
  sourceUrl: string;
}
export interface DictionaryLookupResult extends DictionarySourceReference {
  provider: DictionaryProvider;
  meanings: DictionaryMeaning[];
}

export const DICTIONARY_PARTS = ['noun', 'verb', 'adjective', 'adverb', 'preposition', 'conjunction',
  'pronoun', 'article', 'auxiliary', 'unclassified'] as const;
export const ECDICT_SOURCE_URL = 'https://github.com/skywind3000/ECDICT';

/** Normalize the exact English spelling used for local lookup and saved attribution. */
export function dictionaryQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const word = value.normalize('NFKC').trim().replace(/’/g, "'").replace(/\s+/g, ' ').toLowerCase();
  return word.length <= 80 && /^\p{Script=Latin}+(?:[' -]\p{Script=Latin}+)*$/u.test(word) ? word : null;
}

export function cambridgeDictionaryUrl(word: string): string {
  return `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(word.replace(/ /g, '-'))}`;
}

export function dictionarySource(value: unknown): DictionarySourceReference | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<DictionarySourceReference>;
  const word = dictionaryQuery(source.word);
  if (!word || (source.provider !== 'ecdict' && source.provider !== 'cambridge')) return null;
  if (source.provider === 'ecdict') return { provider: 'ecdict', word, sourceUrl: ECDICT_SOURCE_URL };
  if (typeof source.sourceUrl !== 'string') return null;
  try {
    const url = new URL(source.sourceUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'dictionary.cambridge.org' || url.port || url.username || url.password
      || !url.pathname.startsWith('/dictionary/english-chinese-traditional/')) return null;
    return { provider: 'cambridge', word, sourceUrl: `${url.origin}${url.pathname}` };
  } catch {
    return null;
  }
}

/** Only ECDICT can provide new selections; legacy source metadata remains readable separately. */
export function dictionaryResult(value: unknown, expectedWord: string): DictionaryLookupResult | null {
  const source = dictionarySource(value);
  if (!source || source.provider !== 'ecdict' || source.word !== dictionaryQuery(expectedWord)
    || (value as { sourceUrl?: unknown }).sourceUrl !== ECDICT_SOURCE_URL) return null;
  const raw = (value as { meanings?: unknown }).meanings;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 40) return null;
  const meanings: DictionaryMeaning[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') return null;
    const { partOfSpeech, text } = entry as DictionaryMeaning;
    if (!DICTIONARY_PARTS.includes(partOfSpeech) || typeof text !== 'string' || !text.trim() || text.length > 240
      || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) return null;
    const meaning = { partOfSpeech, text: text.trim() };
    const key = `${partOfSpeech}:${meaning.text}`;
    if (!seen.has(key)) meanings.push(meaning);
    seen.add(key);
  }
  return { ...source, provider: 'ecdict', meanings };
}
