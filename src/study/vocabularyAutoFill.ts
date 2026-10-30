import type { EnglishReviewWordEntry, GsatVocabularyLevel, VocabularyTranslations } from '../types.ts';
import { CEEC_VOCABULARY } from '../data/ceecVocabulary.ts';
import { CEEC_TRANSLATIONS } from '../data/ceecTranslations.ts';
import { VOCABULARY_PARTS_OF_SPEECH, vocabularyTranslationText } from './vocabularyTranslationCounts.ts';

const OWNED_FIELDS = [...VOCABULARY_PARTS_OF_SPEECH.map(([field]) => field),
  'translation', 'translationsByPartOfSpeech', 'gsatLevel', 'showGsatLevel'];

interface AutoFillSnapshot {
  version: 1;
  word: string;
  defaults: Record<string, unknown>;
  dictionary: boolean;
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
  if (!Object.hasOwn(CEEC_VOCABULARY, word)) return null;
  const entry = CEEC_VOCABULARY[word];
  const translations = Object.hasOwn(CEEC_TRANSLATIONS, word) ? CEEC_TRANSLATIONS[word] : {};
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
export function applyVocabularyAutoFill(word: EnglishReviewWordEntry): boolean {
  if (word.fixedCombination === true || word.beautifulSentences === true) return false;
  const before = JSON.stringify(word);
  const key = normalizedReferenceWord(word.text);
  const previous = snapshot(word.vocabularyAutoFill);
  const owned = new Set<string>();
  const blocked = new Set<string>();
  if (previous) {
    for (const field of OWNED_FIELDS) {
      if (!Object.hasOwn(previous.defaults, field)) continue;
      if (equal(word[field], previous.defaults[field])) owned.add(field);
      else blocked.add(field);
    }
    if (previous.word !== key) {
      for (const field of owned) delete word[field];
      delete word.vocabularyAutoFill;
    }
  }
  const reference = vocabularyReference(word.text);
  const defaults: Record<string, unknown> = {};
  for (const field of blocked) defaults[field] = JSON.parse(JSON.stringify(previous!.defaults[field])) as unknown;
  if (!reference) {
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
    for (const [field] of VOCABULARY_PARTS_OF_SPEECH) setDefault(field, reference.parts.includes(field), true);
  }
  setDefault('gsatLevel', reference.level);
  setDefault('showGsatLevel', true);
  const canFillTranslations = ['translation', 'translationsByPartOfSpeech'].every(field => (
    !blocked.has(field) && (owned.has(field) || empty(word[field]))
  ));
  if (canFillTranslations && Object.keys(reference.translations).length) {
    setDefault('translationsByPartOfSpeech', reference.translations);
    setDefault('translation', vocabularyTranslationText(reference.translations));
    word.vocabularyTranslationSource = 'ECDICT';
  }
  word.vocabularyAutoFill = { version: 1, word: key, defaults,
    dictionary: Object.hasOwn(defaults, 'translationsByPartOfSpeech') || previous?.dictionary === true } satisfies AutoFillSnapshot;
  return JSON.stringify(word) !== before;
}

export function vocabularyAutoFillStatus(word: EnglishReviewWordEntry): string {
  if (!snapshot(word.vocabularyAutoFill)) return '';
  const reference = vocabularyReference(word.text);
  if (!reference || word.fixedCombination === true || word.beautifulSentences === true) return '';
  const level = reference.levels.map(value => `Level ${value}`).join('／');
  const missing = reference.parts.some(field => !reference.translations[field as keyof VocabularyTranslations]?.length);
  return `大考中心 ${level}${reference.levels.length > 1 ? '（自動帶入較低級）' : ''}｜中文參考 ECDICT${missing ? '；部分詞性尚無對應翻譯' : ''}`;
}

export function vocabularyAutoFillSources(word: EnglishReviewWordEntry): { ceec: boolean; ecdict: boolean } | undefined {
  const data = snapshot(word.vocabularyAutoFill);
  const dictionary = word.vocabularyTranslationSource === 'ECDICT' || data?.dictionary === true;
  if (!data && !dictionary) return undefined;
  return { ceec: Boolean(data && data.word === normalizedReferenceWord(word.text) && vocabularyReference(word.text)
    && !word.fixedCombination && !word.beautifulSentences), ecdict: dictionary };
}
