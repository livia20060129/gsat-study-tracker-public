import { CEEC_TRANSLATIONS } from '../data/ceecTranslations.ts';
import { dictionaryQuery } from './dictionaryEntries.ts';
import type { VocabularyTranslations } from '../types.ts';

type DictionaryShard = Record<string, VocabularyTranslations>;
export type DictionaryFetch = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

/** Only requested hash buckets are downloaded; failures remain retryable. */
export function createEcdictLookup(fetchShard: DictionaryFetch, baseUrl: string): {
  find(value: unknown): VocabularyTranslations | null;
  load(value: unknown): Promise<VocabularyTranslations | null>;
} {
  const shards = new Map<string, DictionaryShard>();
  const pending = new Map<string, Promise<void>>();
  function bucket(word: string): string {
    let hash = 2166136261;
    for (const letter of word) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
    return (hash % 256).toString(16).padStart(2, '0');
  }
  function find(value: unknown): VocabularyTranslations | null {
    const word = dictionaryQuery(value);
    if (!word) return null;
    const shard = shards.get(bucket(word));
    const table = Object.hasOwn(CEEC_TRANSLATIONS, word) ? CEEC_TRANSLATIONS : shard;
    if (!table || !Object.hasOwn(table, word)) return null;
    return JSON.parse(JSON.stringify(table[word])) as VocabularyTranslations;
  }
  async function load(value: unknown): Promise<VocabularyTranslations | null> {
    const word = dictionaryQuery(value);
    if (!word) return null;
    const existing = find(word);
    if (existing) return existing;
    const key = bucket(word);
    if (!shards.has(key)) {
      let request = pending.get(key);
      if (!request) {
        request = (async function download(): Promise<void> {
          const response = await fetchShard(`${baseUrl}dictionaries/ecdict-v1/${key}.json`);
          if (!response.ok) throw new Error('ECDICT lookup is temporarily unavailable.');
          const data = await response.json();
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid ECDICT shard.');
          shards.set(key, data as DictionaryShard);
          if (shards.size > 8) shards.delete(shards.keys().next().value!);
        })();
        pending.set(key, request);
      }
      try { await request; }
      finally { if (pending.get(key) === request) pending.delete(key); }
    }
    return find(word);
  }
  return { find, load };
}

const lookup = createEcdictLookup(function fetchShard(url) { return fetch(url); }, import.meta.env?.BASE_URL ?? '/');
export const ecdictTranslations = lookup.find;
export const loadEcdictTranslations = lookup.load;
