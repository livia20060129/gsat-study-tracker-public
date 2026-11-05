import { ceecCoreTranslations } from './ceecCoreTranslations.ts';
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
  const pending = new Map<string, Promise<DictionaryShard>>();
  function translationsIn(shard: DictionaryShard | undefined, word: string): VocabularyTranslations | null {
    if (!shard || !Object.hasOwn(shard, word)) return null;
    return JSON.parse(JSON.stringify(shard[word])) as VocabularyTranslations;
  }
  function bucket(word: string): string {
    let hash = 2166136261;
    for (const letter of word) hash = Math.imul(hash ^ letter.charCodeAt(0), 16777619) >>> 0;
    return (hash % 256).toString(16).padStart(2, '0');
  }
  function find(value: unknown): VocabularyTranslations | null {
    const word = dictionaryQuery(value);
    if (!word) return null;
    const shard = shards.get(bucket(word));
    const core = ceecCoreTranslations(word);
    if (core) return core;
    return translationsIn(shard, word);
  }
  async function load(value: unknown): Promise<VocabularyTranslations | null> {
    const word = dictionaryQuery(value);
    if (!word) return null;
    const existing = find(word);
    if (existing) return existing;
    const key = bucket(word);
    let shard = shards.get(key);
    if (!shard) {
      let request = pending.get(key);
      if (!request) {
        request = (async function download(): Promise<DictionaryShard> {
          const response = await fetchShard(`${baseUrl}dictionaries/ecdict-v1/${key}.json`);
          if (!response.ok) throw new Error('ECDICT lookup is temporarily unavailable.');
          const data = await response.json();
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid ECDICT shard.');
          shards.set(key, data as DictionaryShard);
          if (shards.size > 8) shards.delete(shards.keys().next().value!);
          return data as DictionaryShard;
        })();
        pending.set(key, request);
      }
      try { shard = await request; }
      finally { if (pending.get(key) === request) pending.delete(key); }
    }
    // The shared cache may evict this bucket while other requests finish; use this response directly.
    return translationsIn(shard, word);
  }
  return { find, load };
}

const lookup = createEcdictLookup(function fetchShard(url) { return fetch(url); }, import.meta.env?.BASE_URL ?? '/');
export const ecdictTranslations = lookup.find;
export const loadEcdictTranslations = lookup.load;
