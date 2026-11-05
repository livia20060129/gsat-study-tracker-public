import type { EnglishReviewWordEntry, GsatVocabularyLevel, VocabularyTranslations } from '../types.ts';
import type { VocabularyDefaultSource } from './vocabularyDefaults.ts';
import type { VocabularyFallbackParts } from './vocabularyFallbackParts.ts';
import { dictionarySource } from './dictionaryEntries.ts';
import { ceecReferenceMetadata } from './ceecReferenceIndex.ts';
import { ecdictTranslations } from './ecdictLookup.ts';
import { VOCABULARY_PARTS_OF_SPEECH, vocabularyTranslationText } from './vocabularyTranslationCounts.ts';

const OWNED_FIELDS = [...VOCABULARY_PARTS_OF_SPEECH.map(([field]) => field),
  'translation', 'translationsByPartOfSpeech', 'gsatLevel', 'showGsatLevel'];

interface AutoFillSnapshot {
  version: 1;
  word: string;
  defaults: Record<string, unknown>;
  dictionary: boolean;
  provider?: VocabularyDefaultSource;
  partsSource?: VocabularyFallbackParts['source'];
}

export interface VocabularyReference {
  word: string;
  level: GsatVocabularyLevel;
  levels: number[];
  parts: string[];
  translations: VocabularyTranslations;
}

function normalizedReferenceWord(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/’/g, "'");
}

/** Exact listed spelling only: no prefix, stemming, sentence or fuzzy matching. */
export function vocabularyReference(value: unknown): VocabularyReference | null {
  const word = normalizedReferenceWord(value);
  const entry = ceecReferenceMetadata(word);
  if (!entry) return null;
  const translations = ecdictTranslations(word) ?? {};
  return { word, level: entry.level as GsatVocabularyLevel, levels: [...entry.levels], parts: [...entry.parts],
    translations: JSON.parse(JSON.stringify(translations)) as VocabularyTranslations };
}

function snapshot(value: unknown): AutoFillSnapshot | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Partial<AutoFillSnapshot>;
  if (data.version !== 1 || typeof data.word !== 'string' || !data.defaults
    || typeof data.defaults !== 'object' || Array.isArray(data.defaults)) return null;
  return data as AutoFillSnapshot;
}

function equal(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function empty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every(entries => Array.isArray(entries) && entries.every(entry => !String(entry).trim()));
}

/** Own only the fields actually filled automatically; later manual changes always win. */
export function applyVocabularyAutoFill(word: EnglishReviewWordEntry, dictionaryTranslations?: VocabularyTranslations, source: VocabularyDefaultSource = 'ECDICT', knownParts?: VocabularyFallbackParts): boolean {
  if (word.fixedCombination === true || word.beautifulSentences === true) return false;
  const before = JSON.stringify(word);
  const key = normalizedReferenceWord(word.text);
  const previous = snapshot(word.vocabularyAutoFill);
  const owned = new Set<string>();
  const blocked = new Set<string>(Object.keys(manualFields(word)));
  if (previous) {
    for (const field of OWNED_FIELDS) {
      if (!Object.hasOwn(previous.defaults, field)) continue;
      if (!blocked.has(field) && equal(word[field], previous.defaults[field])) owned.add(field);
      else blocked.add(field);
    }
    if (previous.word !== key) {
      for (const field of owned) delete word[field];
      delete word.vocabularyAutoFill;
    }
  }
  const reference = ceecReferenceMetadata(normalizedReferenceWord(word.text));
  const translations = dictionaryTranslations ?? ecdictTranslations(word.text);
  const defaults: Record<string, unknown> = {};
  for (const field of blocked) {
    if (previous && Object.hasOwn(previous.defaults, field)) defaults[field] = JSON.parse(JSON.stringify(previous.defaults[field])) as unknown;
  }
  if (!reference && !translations) {
    // Keep manual-field tombstones through an intermediate unlisted spelling.
    if (previous && blocked.size) word.vocabularyAutoFill = { version: 1, word: key, defaults,
      dictionary: previous.dictionary } satisfies AutoFillSnapshot;
    return JSON.stringify(word) !== before;
  }
  function setDefault(field: string, value: unknown, permitFalse = false): void {
    if (blocked.has(field)) return;
    if (!owned.has(field) && !empty(word[field]) && !(permitFalse && word[field] === false)) return;
    const copy = JSON.parse(JSON.stringify(value)) as unknown;
    word[field] = copy;
    defaults[field] = JSON.parse(JSON.stringify(copy)) as unknown;
  }

  const hasManualPart = VOCABULARY_PARTS_OF_SPEECH.some(([field]) => word[field] === true && !owned.has(field));
  if (!hasManualPart) {
    const parts = knownParts?.parts;
    if (translations) for (const [field] of VOCABULARY_PARTS_OF_SPEECH) setDefault(field, parts ? parts.includes(field) : Object.hasOwn(translations, field), true);
  }
  if (reference) {
    setDefault('gsatLevel', reference.level);
    setDefault('showGsatLevel', true);
  }
  const canFillTranslations = ['translation', 'translationsByPartOfSpeech'].every(field => (
    !blocked.has(field) && (owned.has(field) || empty(word[field]))
  ));
  if (canFillTranslations && translations && Object.keys(translations).length) {
    setDefault('translationsByPartOfSpeech', translations);
    setDefault('translation', vocabularyTranslationText(translations));
    word.vocabularyTranslationSource = source;
  }
  if (translations && Object.values(translations).some(meanings => meanings?.some(meaning => meaning.trim()))) {
    delete word.vocabularyLookupPending;
  }
  let partsSource = knownParts?.source;
  if (!partsSource && previous?.word === key && !dictionaryTranslations) partsSource = previous.partsSource;
  word.vocabularyAutoFill = { version: 1, word: key, defaults,
    dictionary: Object.hasOwn(defaults, 'translationsByPartOfSpeech') || previous?.dictionary === true,
    provider: word.vocabularyTranslationSource === 'Google Translate' ? 'Google Translate' : 'ECDICT',
    ...(partsSource ? { partsSource } : {}) } satisfies AutoFillSnapshot;
  return JSON.stringify(word) !== before;
}

export function vocabularyAutoFillStatus(word: EnglishReviewWordEntry): string {
  if (!snapshot(word.vocabularyAutoFill)) return '';
  const reference = ceecReferenceMetadata(normalizedReferenceWord(word.text));
  if (word.fixedCombination === true || word.beautifulSentences === true) return '';
  if (word.vocabularyTranslationSource === 'Google Translate') {
    const partsSource = snapshot(word.vocabularyAutoFill)?.partsSource;
    return partsSource ? `Google Translate｜中文；${partsSource}｜詞性（可手動修改）` : 'Google Translate｜自動翻譯；詞性可手動填寫';
  }
  if (!reference) return 'ECDICT｜中文翻譯與詞性';
  const level = reference.levels.map(value => `Level ${value}`).join('／');
  return `大考中心 ${level}${reference.levels.length > 1 ? '（自動帶入較低級）' : ''}｜ECDICT 中文翻譯與詞性`;
}

function manualFields(word: EnglishReviewWordEntry): Record<string, boolean> {
  const stored = word.vocabularyManualFields;
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  return Object.fromEntries(OWNED_FIELDS.filter(field => Object.hasOwn(stored, field) && stored[field] === true).map(field => [field, true]));
}

export function markVocabularyManualFields(word: EnglishReviewWordEntry, fields: readonly string[]): void {
  const current = manualFields(word);
  for (const field of fields) if (OWNED_FIELDS.includes(field)) current[field] = true;
  word.vocabularyManualFields = current;
}

export function vocabularyAutoFillSources(word: EnglishReviewWordEntry): { ceec: boolean; ecdict: boolean; google?: boolean } | undefined {
  const data = snapshot(word.vocabularyAutoFill);
  const sources = Array.isArray(word.dictionarySources) ? word.dictionarySources.map(dictionarySource) : [];
  const google = word.vocabularyTranslationSource === 'Google Translate' || data?.provider === 'Google Translate'
    || sources.some(source => source?.provider === 'google');
  const dictionary = data?.partsSource === 'ECDICT' || word.vocabularyTranslationSource === 'ECDICT'
    || sources.some(source => source?.provider === 'ecdict') || (!google && data?.dictionary === true);
  if (!data && !dictionary && !google) return undefined;
  return { ceec: Boolean(data && data.word === normalizedReferenceWord(word.text) && ceecReferenceMetadata(normalizedReferenceWord(word.text))
    && !word.fixedCombination && !word.beautifulSentences), ecdict: dictionary, ...(google ? { google: true } : {}) };
}
