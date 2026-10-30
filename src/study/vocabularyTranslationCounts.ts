import type { EnglishReviewPartOfSpeech, VocabularyTranslations } from '../types.ts';

export const VOCABULARY_PARTS_OF_SPEECH = [
  ['noun', 'Noun'], ['verb', 'Verb'], ['adjective', 'Adjective'], ['adverb', 'Adverb'],
  ['preposition', 'Preposition'], ['conjunction', 'Conjunction'],
  ['pronoun', 'Pronoun'], ['article', 'Article'], ['auxiliary', 'Auxiliary'],
] as const;

export type VocabularyPartOfSpeechField = EnglishReviewPartOfSpeech;

export interface VocabularyTranslationCount {
  partOfSpeech: string;
  count: number;
}

const PART_OF_SPEECH_LABELS: Record<string, string> = {
  n: 'Noun', noun: 'Noun', 名詞: 'Noun',
  v: 'Verb', vt: 'Verb', vi: 'Verb', verb: 'Verb', 動詞: 'Verb',
  adj: 'Adjective', adjective: 'Adjective', 形容詞: 'Adjective',
  adv: 'Adverb', adverb: 'Adverb', 副詞: 'Adverb',
  prep: 'Preposition', preposition: 'Preposition', 介系詞: 'Preposition', 介詞: 'Preposition',
  conj: 'Conjunction', conjunction: 'Conjunction', 連接詞: 'Conjunction',
  pron: 'Pronoun', pronoun: 'Pronoun', 代名詞: 'Pronoun',
  art: 'Article', article: 'Article', 冠詞: 'Article',
  aux: 'Auxiliary', auxiliary: 'Auxiliary', 助動詞: 'Auxiliary',
};
const PART_OF_SPEECH_PATTERN = Object.keys(PART_OF_SPEECH_LABELS).sort((left, right) => right.length - left.length).join('|');
const CLOSING_BRACKETS: Record<string, string> = { '(': ')', '（': '）', '[': ']', '【': '】', '「': '」', '『': '』' };

/** Count entered glosses, not Chinese characters; punctuation inside notes is not a separator. */
function translationTerms(value: string): string[] {
  const terms = new Set<string>();
  const closing: string[] = [];
  let current = '';
  function flush(): void {
    const term = current.trim().replace(/^(?:\d+[.)、]\s*)/, '').trim();
    if (term && !/^[-—–]+$/.test(term)) terms.add(term);
    current = '';
  }
  for (const character of value) {
    if (CLOSING_BRACKETS[character]) closing.push(CLOSING_BRACKETS[character]);
    else if (closing.at(-1) === character) closing.pop();
    if (!closing.length && /[;；、,，/|｜\n]/.test(character)) flush();
    else current += character;
  }
  flush();
  return [...terms];
}

export function normalizedVocabularyTranslations(value: unknown): VocabularyTranslations {
  const result: VocabularyTranslations = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const fields: Array<keyof VocabularyTranslations> = [...VOCABULARY_PARTS_OF_SPEECH.map(([field]) => field), 'unclassified'];
  for (const field of fields) {
    const values = (value as Record<string, unknown>)[field];
    if (!Array.isArray(values)) continue;
    const translations = values.filter((translation): translation is string => typeof translation === 'string');
    result[field] = translations.length ? [...translations] : [''];
  }
  return result;
}

/** Legacy free text is interpreted only when no structured translation rows have been saved. */
export function vocabularyTranslationGroups(
  value: unknown,
  tags: readonly string[] = [],
  stored: VocabularyTranslations = {},
): VocabularyTranslations {
  const structured = normalizedVocabularyTranslations(stored);
  if (Object.keys(structured).length) return structured;
  const text = String(value ?? '').normalize('NFKC').trim();
  const selectedLabels = VOCABULARY_PARTS_OF_SPEECH.map(([, label]) => label).filter(label => tags.includes(label));
  const fallback = selectedLabels.length === 1 ? selectedLabels[0] : '未分詞性';
  const termsByPart = new Map<string, Set<string>>();
  function addTerms(label: string, part: string): void {
    const terms = termsByPart.get(label) ?? new Set<string>();
    translationTerms(part).forEach(term => terms.add(term));
    if (terms.size) termsByPart.set(label, terms);
  }
  const marker = new RegExp(
    `(?:^|[\\s;；|｜、,，])(?:\\(\\s*(${PART_OF_SPEECH_PATTERN})\\.?\\s*\\)|(${PART_OF_SPEECH_PATTERN})\\s*[.:])\\s*`,
    'gi',
  );
  let currentPart = fallback;
  let start = 0;
  for (const match of text.matchAll(marker)) {
    addTerms(currentPart, text.slice(start, match.index));
    currentPart = PART_OF_SPEECH_LABELS[(match[1] ?? match[2]).toLowerCase()];
    start = match.index! + match[0].length;
  }
  addTerms(currentPart, text.slice(start));
  const groups: VocabularyTranslations = {};
  for (const [field, label] of VOCABULARY_PARTS_OF_SPEECH) {
    const terms = termsByPart.get(label);
    if (terms) groups[field] = [...terms];
  }
  const unclassified = termsByPart.get('未分詞性');
  if (unclassified) groups.unclassified = [...unclassified];
  return groups;
}

export function vocabularyTranslationCounts(
  value: unknown,
  tags: readonly string[] = [],
  stored: VocabularyTranslations = {},
): VocabularyTranslationCount[] {
  const groups = vocabularyTranslationGroups(value, tags, stored);
  const counts: VocabularyTranslationCount[] = [];
  for (const [field, label] of VOCABULARY_PARTS_OF_SPEECH) {
    if (tags.includes(label) || groups[field]) {
      counts.push({ partOfSpeech: label, count: groups[field]?.filter(term => term.trim()).length ?? 0 });
    }
  }
  const unclassifiedCount = groups.unclassified?.filter(term => term.trim()).length ?? 0;
  if (unclassifiedCount) counts.push({ partOfSpeech: '未分詞性', count: unclassifiedCount });
  return counts;
}

/** Keep the original translation field readable by older clients and combination/sentence editors. */
export function vocabularyTranslationText(groups: VocabularyTranslations): string {
  const text: string[] = [];
  for (const [field, label] of VOCABULARY_PARTS_OF_SPEECH) {
    const terms = groups[field]?.map(term => term.trim()).filter(Boolean);
    if (terms?.length) text.push(`${label}：${terms.join('、')}`);
  }
  const unclassified = groups.unclassified?.map(term => term.trim()).filter(Boolean);
  if (unclassified?.length) text.push(unclassified.join('、'));
  return text.join('；');
}
