import type { VocabularyContentKind, VocabularyReviewEntry } from './vocabularyReview.ts';
import { VOCABULARY_PARTS_OF_SPEECH, vocabularyTranslationGroups } from './vocabularyTranslationCounts.ts';

export interface VocabularyMeaningGroup {
  partOfSpeech: string;
  meanings: string[];
}

function enteredMeanings(values: string[] = []): string[] {
  const entered = values.map(value => value.trim()).filter(Boolean);
  return entered.length ? entered : [''];
}

/** One row per meaning, shared by the review page and its printable table. */
export function vocabularyMeaningGroups(
  entry: VocabularyReviewEntry,
  kind: VocabularyContentKind,
): VocabularyMeaningGroup[] {
  if (kind !== '單字') {
    const groups = vocabularyTranslationGroups(entry.translation);
    return [{ partOfSpeech: '', meanings: enteredMeanings(Object.values(groups).flat()) }];
  }
  const stored = vocabularyTranslationGroups(entry.translation, entry.tags, entry.translationsByPartOfSpeech);
  const groups: VocabularyMeaningGroup[] = [];
  for (const [field, label] of VOCABULARY_PARTS_OF_SPEECH) {
    if (entry.tags.includes(label)) groups.push({ partOfSpeech: label, meanings: enteredMeanings(stored[field]) });
  }
  if (stored.unclassified?.some(value => value.trim())) {
    groups.push({ partOfSpeech: '未分詞性', meanings: enteredMeanings(stored.unclassified) });
  }
  return groups.length ? groups : [{ partOfSpeech: '未標註', meanings: [''] }];
}
