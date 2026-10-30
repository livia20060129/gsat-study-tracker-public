import type { DictionaryLookupResult } from './dictionaryEntries.ts';

/** Retired parser: remote dictionary content cannot become a new translation selection. */
export function cambridgeApiResult(_payload: unknown, _word: string): DictionaryLookupResult | null {
  return null;
}
