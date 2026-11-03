import type { EnglishReviewWordEntry, GsatVocabularyLevel, StudyItem, StudyRecord, VocabularyStars, VocabularyTranslations } from '../types.ts';
import { isVocabularyStarKey, normalizedVocabularyStars, remapVocabularyMeaningStars } from './vocabularyStars.ts';
import { applyVocabularyAutoFill, markVocabularyManualFields, vocabularyAutoFillSources } from './vocabularyAutoFill.ts';
import { applyDictionarySelection, dictionarySources } from './dictionarySelection.ts';
import type { DictionaryLookupResult, DictionarySourceReference } from './dictionaryEntries.ts';
import {
  normalizedVocabularyTranslations,
  VOCABULARY_PARTS_OF_SPEECH,
  vocabularyTranslationText,
  vocabularyTranslationGroups,
  type VocabularyPartOfSpeechField,
} from './vocabularyTranslationCounts.ts';

export { VOCABULARY_PARTS_OF_SPEECH, type VocabularyPartOfSpeechField } from './vocabularyTranslationCounts.ts';

const NESTED_ITEM_FIELDS = [
  'makeupEntries',
  'reviewEntries',
  'interactiveEntries',
  'calendarIntegrationEntries',
  'groupedWorkEntries',
  'dailyWorkSourceItems',
] as const;

export const VOCABULARY_CONTENT_KINDS = ['單字', '組合', '句子'] as const;

export type VocabularyContentKind = (typeof VOCABULARY_CONTENT_KINDS)[number];

export interface VocabularyWordEdits {
  star?: { key: string; marked: boolean };
  translationRemoval?: { field: keyof VocabularyTranslations; index: number };
  autoFill?: boolean;
  autoFillTranslations?: VocabularyTranslations;
  dictionarySelection?: DictionaryLookupResult;
  contentKind?: VocabularyContentKind;
  partsOfSpeech?: ReadonlySet<VocabularyPartOfSpeechField>;
  text?: string;
  translation?: string;
  gsatLevel?: GsatVocabularyLevel;
  showGsatLevel?: boolean;
  translationsByPartOfSpeech?: VocabularyTranslations;
}

export interface VocabularyReviewEntry {
  vocabularyStars?: VocabularyStars;
  key: string;
  text: string;
  lookupQuery: string;
  lookupUrl: string;
  letter: string;
  tags: string[];
  contentKinds: VocabularyContentKind[];
  translation: string;
  gsatLevel: GsatVocabularyLevel | null;
  showGsatLevel: boolean;
  translationsByPartOfSpeech: VocabularyTranslations;
  sourceDates: string[];
  occurrenceCount: number;
  referenceSources?: { ceec: boolean; ecdict: boolean };
  dictionarySources?: DictionarySourceReference[];
}

interface MutableVocabularyReviewEntry extends Omit<VocabularyReviewEntry, 'tags' | 'contentKinds' | 'sourceDates'> {
  tags: Set<string>;
  contentKinds: Set<VocabularyContentKind>;
  sourceDates: Set<string>;
}

export interface VocabularyLevelGroup {
  level: GsatVocabularyLevel;
  label: string;
  entries: VocabularyReviewEntry[];
}

const vocabularyCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function compareVocabularyEntries(left: VocabularyReviewEntry, right: VocabularyReviewEntry): number {
  if (left.letter === '#' && right.letter !== '#') return 1;
  if (left.letter !== '#' && right.letter === '#') return -1;
  return vocabularyCollator.compare(left.lookupQuery || left.text, right.lookupQuery || right.text);
}

function normalizedWordText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function normalizedTranslation(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ');
}

export function normalizedGsatVocabularyLevel(value: unknown): GsatVocabularyLevel | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (String(value).trim() === '') return null;
  const level = Number(value);
  return Number.isInteger(level) && level >= 1 && level <= 6 ? level as GsatVocabularyLevel : null;
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
          contentKinds: new Set<VocabularyContentKind>(),
          translation: '',
          gsatLevel: null,
          showGsatLevel: false,
          translationsByPartOfSpeech: {},
          sourceDates: new Set<string>(),
          occurrenceCount: 0,
        };
        entries.set(key, entry);
      }
      entry.occurrenceCount += 1;
      if (word.vocabularyStars) entry.vocabularyStars = { ...entry.vocabularyStars, ...normalizedVocabularyStars(word.vocabularyStars) };
      const sources = dictionarySources(word.dictionarySources);
      if (sources.length) entry.dictionarySources = dictionarySources([...(entry.dictionarySources ?? []), ...sources]);
      const referenceSources = vocabularyAutoFillSources(word);
      if (referenceSources) entry.referenceSources = {
        ceec: entry.referenceSources?.ceec === true || referenceSources.ceec,
        ecdict: entry.referenceSources?.ecdict === true || referenceSources.ecdict,
      };
      if (date) entry.sourceDates.add(date);
      const translation = normalizedTranslation(word.translation);
      if (translation || Object.prototype.hasOwnProperty.call(word, 'translationsByPartOfSpeech')) {
        entry.translation = translation;
        entry.translationsByPartOfSpeech = normalizedVocabularyTranslations(word.translationsByPartOfSpeech);
      }
      if (Object.prototype.hasOwnProperty.call(word, 'gsatLevel')) {
        entry.gsatLevel = normalizedGsatVocabularyLevel(word.gsatLevel);
      }
      if (typeof word.showGsatLevel === 'boolean') entry.showGsatLevel = word.showGsatLevel;
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

  return [...entries.values()]
    .map(entry => ({
      ...entry,
      tags: VOCABULARY_PARTS_OF_SPEECH
        .filter(([, label]) => entry.tags.has(label))
        .map(([, label]) => label),
      contentKinds: [...entry.contentKinds],
      sourceDates: [...entry.sourceDates].sort(),
    }))
    .sort(compareVocabularyEntries);
}

export function vocabularyEntryHasVisibleLevel(entry: VocabularyReviewEntry): boolean {
  return entry.contentKinds.includes('單字')
    && entry.showGsatLevel
    && normalizedGsatVocabularyLevel(entry.gsatLevel) !== null;
}

export function vocabularyLevelGroups(entries: readonly VocabularyReviewEntry[]): VocabularyLevelGroup[] {
  return ([1, 2, 3, 4, 5, 6] as const).flatMap(level => {
    const words = entries.filter(entry => vocabularyEntryHasVisibleLevel(entry) && entry.gsatLevel === level)
      .sort(compareVocabularyEntries);
    return words.length ? [{ level, label: `Level ${level}`, entries: words }] : [];
  });
}

function starMeaningGroups(word: EnglishReviewWordEntry): Record<string, string[]> {
  const tags = VOCABULARY_PARTS_OF_SPEECH.filter(([field]) => word[field] === true).map(([, label]) => label);
  const groups = vocabularyTranslationGroups(word.translation, tags, word.translationsByPartOfSpeech);
  if (word.fixedCombination === true || word.beautifulSentences === true) return { '': Object.values(groups).flat() };
  return Object.fromEntries(Object.entries(groups).map(([field, values]) => {
    const label = VOCABULARY_PARTS_OF_SPEECH.find(([key]) => key === field)?.[1] ?? '未分詞性';
    return [label, values];
  }));
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
      const beforeWord = JSON.stringify(word);
      const previousMeanings = starMeaningGroups(word);
      if (typeof rawWord === 'string') item.f.words[index] = word;
      if (edits.text !== undefined) {
        const nextText = normalizedWordText(edits.text);
        if (nextText && word.text !== nextText) {
          word.text = nextText;
          changed = true;
        }
      }
      if (edits.contentKind) {
        const fixedCombination = edits.contentKind === '組合';
        const beautifulSentences = edits.contentKind === '句子';
        if (word.fixedCombination !== fixedCombination) {
          word.fixedCombination = fixedCombination;
          changed = true;
        }
        if (word.beautifulSentences !== beautifulSentences) {
          word.beautifulSentences = beautifulSentences;
          changed = true;
        }
      }
      if ((edits.text !== undefined || edits.autoFill) && applyVocabularyAutoFill(word, edits.autoFillTranslations)) changed = true;
      if (edits.partsOfSpeech) {
        markVocabularyManualFields(word, VOCABULARY_PARTS_OF_SPEECH.map(([field]) => field));
        for (const [field] of VOCABULARY_PARTS_OF_SPEECH) {
          const enabled = edits.partsOfSpeech.has(field);
          if (word[field] !== enabled) {
            word[field] = enabled;
            changed = true;
          }
        }
      }
      if (edits.translation !== undefined) {
        markVocabularyManualFields(word, ['translation', 'translationsByPartOfSpeech']);
        if (word.translation !== edits.translation) {
          word.translation = edits.translation;
          changed = true;
        }
        if (word.translationsByPartOfSpeech !== undefined) {
          delete word.translationsByPartOfSpeech;
          changed = true;
        }
      }
      if (edits.translationsByPartOfSpeech !== undefined) {
        markVocabularyManualFields(word, ['translation', 'translationsByPartOfSpeech']);
        const current = normalizedVocabularyTranslations(word.translationsByPartOfSpeech);
        const updates = normalizedVocabularyTranslations(edits.translationsByPartOfSpeech);
        const next = { ...current, ...updates };
        if (JSON.stringify(next) !== JSON.stringify(current)) {
          word.translationsByPartOfSpeech = next;
          word.translation = vocabularyTranslationText(next);
          changed = true;
        }
      }
      if (edits.gsatLevel !== undefined) {
        markVocabularyManualFields(word, ['gsatLevel']);
        const level = normalizedGsatVocabularyLevel(edits.gsatLevel);
        if (level !== null && word.gsatLevel !== level) {
          word.gsatLevel = level;
          changed = true;
        }
      }
      if (edits.showGsatLevel !== undefined && word.showGsatLevel !== edits.showGsatLevel) {
        markVocabularyManualFields(word, ['showGsatLevel']);
        word.showGsatLevel = edits.showGsatLevel;
        changed = true;
      }
      if (edits.dictionarySelection && applyDictionarySelection(word, edits.dictionarySelection)) changed = true;
      if (word.vocabularyStars && (edits.translation !== undefined || edits.translationsByPartOfSpeech !== undefined)) {
        const removal = edits.translationRemoval;
        const partOfSpeech = VOCABULARY_PARTS_OF_SPEECH.find(([field]) => field === removal?.field)?.[1] ?? '未分詞性';
        word.vocabularyStars = remapVocabularyMeaningStars(normalizedVocabularyStars(word.vocabularyStars), previousMeanings,
          starMeaningGroups(word), removal ? { partOfSpeech, index: removal.index } : undefined);
      }
      if (edits.star && isVocabularyStarKey(edits.star.key)) {
        word.vocabularyStars = { ...normalizedVocabularyStars(word.vocabularyStars), [edits.star.key]: edits.star.marked };
      }
      if (JSON.stringify(word) !== beforeWord) changed = true;
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
