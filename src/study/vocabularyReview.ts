import type { EnglishReviewWordEntry, StudyItem, StudyRecord } from '../types.ts';

const NESTED_ITEM_FIELDS = [
  'makeupEntries',
  'reviewEntries',
  'interactiveEntries',
  'calendarIntegrationEntries',
  'groupedWorkEntries',
  'dailyWorkSourceItems',
] as const;

export const VOCABULARY_PARTS_OF_SPEECH = [
  ['noun', 'Noun'],
  ['verb', 'Verb'],
  ['adjective', 'Adjective'],
  ['adverb', 'Adverb'],
  ['preposition', 'Preposition'],
  ['conjunction', 'Conjunction'],
] as const;

export type VocabularyPartOfSpeechField = (typeof VOCABULARY_PARTS_OF_SPEECH)[number][0];
export type VocabularyRecordKind = 'word' | 'combination' | 'sentence';

export interface VocabularyWordEdits {
  partsOfSpeech?: ReadonlySet<VocabularyPartOfSpeechField>;
  translation?: string;
  contentKind?: VocabularyRecordKind;
  text?: string;
}

export interface VocabularyReviewEntry {
  key: string;
  text: string;
  lookupQuery: string;
  lookupUrl: string;
  letter: string;
  tags: string[];
  contentKinds: string[];
  translation: string;
  sourceDates: string[];
  occurrenceCount: number;
}

interface MutableVocabularyReviewEntry extends Omit<VocabularyReviewEntry, 'tags' | 'contentKinds' | 'sourceDates'> {
  tags: Set<string>;
  contentKinds: Set<string>;
  sourceDates: Set<string>;
}

function normalizedWordText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizedTranslation(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function vocabularyKey(value: string): string {
  return value.toLocaleLowerCase('en-US');
}

export function vocabularyEntryKey(value: unknown): string {
  return vocabularyKey(normalizedWordText(value));
}

function englishRuns(value: string): string[] {
  return value.match(/[A-Za-z][A-Za-z'’.-]*(?:\s+[A-Za-z][A-Za-z'’.-]*)*/g) ?? [];
}

function withoutPartOfSpeechPrefix(value: string): string {
  return value
    .replace(/^(?:n|v|adj|adv|prep|conj)\.?\s+/i, '')
    .replace(/[.]+$/g, '')
    .trim();
}

/** Returns the most useful English word or phrase contained in an editable row. */
export function oxfordLookupQuery(value: unknown): string {
  const text = normalizedWordText(value);
  const candidates = englishRuns(text)
    .map(withoutPartOfSpeechPrefix)
    .filter(candidate => /[A-Za-z]/.test(candidate));
  return candidates.sort((left, right) => right.length - left.length)[0] ?? '';
}

export function oxfordSearchUrl(value: unknown): string {
  const query = oxfordLookupQuery(value);
  return query
    ? `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(query)}`
    : '';
}

function vocabularyLetter(query: string): string {
  const match = query.match(/[A-Za-z]/);
  return match ? match[0].toUpperCase() : '#';
}

function wordObject(value: string | EnglishReviewWordEntry): EnglishReviewWordEntry {
  return typeof value === 'string' ? { text: value } : value;
}

function collectItemWords(
  item: StudyItem,
  date: string,
  entries: Map<string, MutableVocabularyReviewEntry>,
  visited: Set<object>,
): void {
  if (!item || typeof item !== 'object' || visited.has(item)) return;
  visited.add(item);

  if (Array.isArray(item.f?.words)) {
    for (const rawWord of item.f.words) {
      const word = wordObject(rawWord);
      const text = normalizedWordText(word.text);
      if (!text) continue;
      const key = vocabularyKey(text);
      const lookupQuery = oxfordLookupQuery(text);
      let entry = entries.get(key);
      if (!entry) {
        entry = {
          key,
          text,
          lookupQuery,
          lookupUrl: oxfordSearchUrl(text),
          letter: vocabularyLetter(lookupQuery),
          tags: new Set<string>(),
          contentKinds: new Set<string>(),
          translation: '',
          sourceDates: new Set<string>(),
          occurrenceCount: 0,
        };
        entries.set(key, entry);
      }
      entry.occurrenceCount += 1;
      if (date) entry.sourceDates.add(date);
      const translation = normalizedTranslation(word.translation);
      if (translation) entry.translation = translation;
      for (const [field, label] of VOCABULARY_PARTS_OF_SPEECH) {
        if (word[field] === true) entry.tags.add(label);
      }
      if (word.beautifulSentences === true) entry.contentKinds.add('句子');
      else if (word.fixedCombination === true) entry.contentKinds.add('組合');
      else entry.contentKinds.add('單字');
    }
  }

  for (const field of NESTED_ITEM_FIELDS) {
    const nested = item.f?.[field];
    if (!Array.isArray(nested)) continue;
    for (const child of nested) collectItemWords(child as StudyItem, date, entries, visited);
  }
}

export function vocabularyReviewEntries(records: StudyRecord[]): VocabularyReviewEntry[] {
  const entries = new Map<string, MutableVocabularyReviewEntry>();
  const orderedRecords = [...records].sort((left, right) => left.date.localeCompare(right.date));
  for (const record of orderedRecords) {
    const visited = new Set<object>();
    for (const item of record.items ?? []) collectItemWords(item, record.date, entries, visited);
  }

  const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return [...entries.values()]
    .map(entry => ({
      ...entry,
      tags: VOCABULARY_PARTS_OF_SPEECH
        .filter(([, label]) => entry.tags.has(label))
        .map(([, label]) => label),
      contentKinds: [...entry.contentKinds],
      sourceDates: [...entry.sourceDates].sort(),
    }))
    .sort((left, right) => {
      if (left.letter === '#' && right.letter !== '#') return 1;
      if (left.letter !== '#' && right.letter === '#') return -1;
      return collator.compare(left.lookupQuery || left.text, right.lookupQuery || right.text);
    });
}

function updateItemWords(
  item: StudyItem,
  key: string,
  edits: VocabularyWordEdits,
  visited: Set<object>,
): boolean {
  if (!item || typeof item !== 'object' || visited.has(item)) return false;
  visited.add(item);
  let changed = false;

  if (Array.isArray(item.f?.words)) {
    for (let index = 0; index < item.f.words.length; index += 1) {
      const rawWord = item.f.words[index];
      const text = typeof rawWord === 'string' ? rawWord : rawWord.text;
      if (vocabularyEntryKey(text) !== key) continue;
      const word = typeof rawWord === 'string' ? { text: rawWord } : rawWord;
      if (typeof rawWord === 'string') item.f.words[index] = word;
      if (edits.partsOfSpeech) {
        for (const [field] of VOCABULARY_PARTS_OF_SPEECH) {
          const enabled = edits.partsOfSpeech.has(field);
          if (word[field] !== enabled) {
            word[field] = enabled;
            changed = true;
          }
        }
      }
      if (edits.translation !== undefined && word.translation !== edits.translation) {
        word.translation = edits.translation;
        changed = true;
      }
      if (edits.text !== undefined && word.text !== edits.text) {
        word.text = edits.text;
        changed = true;
      }
      if (edits.contentKind !== undefined) {
        const fixedCombination = edits.contentKind === 'combination';
        const beautifulSentences = edits.contentKind === 'sentence';
        if (word.fixedCombination !== fixedCombination) {
          word.fixedCombination = fixedCombination;
          changed = true;
        }
        if (word.beautifulSentences !== beautifulSentences) {
          word.beautifulSentences = beautifulSentences;
          changed = true;
        }
      }
    }
  }

  for (const field of NESTED_ITEM_FIELDS) {
    const nested = item.f?.[field];
    if (!Array.isArray(nested)) continue;
    for (const child of nested) {
      if (updateItemWords(child as StudyItem, key, edits, visited)) changed = true;
    }
  }
  return changed;
}

/** Updates every occurrence of one imported word so duplicate rows stay consistent. */
export function updateVocabularyWordEntries(
  record: StudyRecord,
  key: string,
  edits: VocabularyWordEdits,
): boolean {
  const visited = new Set<object>();
  let changed = false;
  for (const item of record.items ?? []) {
    if (updateItemWords(item, key, edits, visited)) changed = true;
  }
  return changed;
}
