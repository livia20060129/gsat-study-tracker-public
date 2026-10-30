import type { StudyItem, StudyRecord } from '../types';

const NESTED_ITEM_FIELDS = [
  'makeupEntries',
  'reviewEntries',
  'interactiveEntries',
  'calendarIntegrationEntries',
  'groupedWorkEntries',
  'dailyWorkSourceItems',
] as const;

const LEGACY_INDEX_ID = /^word:(?!v2:).+:\d+$/;

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(source).filter((entry) => entry !== 'id').sort()) {
    output[key] = canonicalValue(source[key]);
  }
  return output;
}

function shortHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function legacyWordEntryId(itemId: string, entry: Record<string, unknown>, occurrence: number): string {
  const seed = JSON.stringify(canonicalValue(entry));
  return `word:v2:${shortHash(itemId || 'item')}:${shortHash(seed)}:${occurrence}`;
}

/**
 * Gives every editable English-review row an immutable identity.
 *
 * Older records stored only mutable text or used a row-index ID. The v2
 * fallback is based on the row content, so deleting or reordering another row
 * does not change this row's identity. Once assigned, editing the text never
 * changes the ID.
 */
export function ensureEnglishReviewWordEntryIds(record: StudyRecord): boolean {
  let changed = false;
  const visited = new Set<StudyItem>();

  const visit = (item: StudyItem): void => {
    if (!item || visited.has(item)) return;
    visited.add(item);
    item.f ||= {};

    if (Array.isArray(item.f.words)) {
      const occurrences = new Map<string, number>();
      item.f.words = item.f.words.map((entry) => {
        const word = typeof entry === 'string'
          ? { text: entry }
          : entry && typeof entry === 'object' && !Array.isArray(entry)
            ? entry
            : { text: '' };
        if (word !== entry) changed = true;
        const currentId = String(word.id ?? '').trim();
        if (!currentId || LEGACY_INDEX_ID.test(currentId)) {
          const seed = JSON.stringify(canonicalValue(word));
          const occurrence = occurrences.get(seed) ?? 0;
          occurrences.set(seed, occurrence + 1);
          word.id = legacyWordEntryId(item.id, word, occurrence);
          changed = true;
        }
        return word;
      });
    }

    for (const field of NESTED_ITEM_FIELDS) {
      const nested = item.f[field];
      if (Array.isArray(nested)) {
        for (const child of nested) visit(child as StudyItem);
      }
    }
  };

  for (const item of record.items || []) visit(item);
  return changed;
}
