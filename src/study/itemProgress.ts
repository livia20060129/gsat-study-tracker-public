import { isAzarGrammarBookTitle } from '../data/azarGrammar.ts';
import { canonicalPageMappedBook, isEnglishPageMappedBook, TOEFL_VOCABULARY_3800_BOOK } from '../data/bookPageMaps.ts';
import { isListeningTestBookTitle } from '../data/englishBooks.ts';
import type { StudyItem } from '../types.ts';
import { effectiveTemplatePresetKey } from './makeup.ts';
import { usesSharedNumberedTemplate } from '../data/numberedScopes.ts';

export const STUDY_PROGRESS_FIELDS = [
  ['progress', '進度'], ['graded', '批改'], ['corrected', '訂正'], ['review', '需要再複習'],
  ['listening', '英聽'], ['vocab', '單字'], ['translation', '中譯英'],
  ['gsatPart1', 'GSAT 第壹部分'],
] as const;

type ProgressKey = typeof STUDY_PROGRESS_FIELDS[number][0];

export interface StudyItemProgress {
  key: ProgressKey;
  label: string;
  checked: boolean;
}

const REVIEW_PROGRESS_KEYS = ['progress', 'graded', 'corrected'] as const;
const ENGLISH_PRACTICE_KEYS = ['listening', 'vocab', 'translation', 'gsatPart1'] as const;

export function isProgressOnlyStudyItem(item: StudyItem): boolean {
  const title = item.f?.title || item.f?.book || item.title;
  return item.type === 'extra' && canonicalPageMappedBook(title) === TOEFL_VOCABULARY_3800_BOOK;
}

function hasCalendarTemplate(item: StudyItem, prefix: string): boolean {
  return (item.source === 'preset' || item.calendarGroupedChild === true)
    && effectiveTemplatePresetKey(item).startsWith(prefix);
}

/** Matches the checkbox-bearing branches of the original card's field renderer. */
function templateProgressKeys(item: StudyItem): readonly ProgressKey[] {
  const fields = item.f ?? {};
  if (item.type === 'extra' && usesSharedNumberedTemplate(item)) return REVIEW_PROGRESS_KEYS;
  switch (item.type) {
    case 'mathLecture':
      return fields.material ? REVIEW_PROGRESS_KEYS : [];
    case 'scienceReview':
      if (('calendarIntegrationChild' in item && item.calendarIntegrationChild === true)
        || (hasCalendarTemplate(item, 'cal_natural_') && fields.calendarNaturalIntegration)) return [];
      return REVIEW_PROGRESS_KEYS;
    case 'chineseReading':
      return fields.kind === 'reading' || hasCalendarTemplate(item, 'cal_gujin_') ? REVIEW_PROGRESS_KEYS : [];
    case 'englishPractice':
      return ENGLISH_PRACTICE_KEYS;
    case 'interactive':
      return fields.interactiveType === 'englishPractice' ? ENGLISH_PRACTICE_KEYS : [];
    case 'extra': {
      const title = String(fields.title ?? '');
      if (isAzarGrammarBookTitle(title)) {
        return hasCalendarTemplate(item, 'cal_azar_') ? [] : REVIEW_PROGRESS_KEYS;
      }
      if (['ACE Reading', '英文：ACE Reading', '英文寫作測驗', '英文文法總複習講義', 'Prism Reading'].includes(title)
        || /^Prism Reading [234]$/.test(title)
        || isEnglishPageMappedBook(title)
        || isListeningTestBookTitle(title)) return REVIEW_PROGRESS_KEYS;
      return [];
    }
    default:
      return [];
  }
}

/** Missing template booleans are unchecked; legacy text progress remains text. */
export function studyItemProgress(item: StudyItem): StudyItemProgress[] {
  const fields = item.f ?? {};
  if (isProgressOnlyStudyItem(item)) {
    return [{ key: 'progress', label: '進度', checked: fields.progress === true }];
  }
  const templateKeys = templateProgressKeys(item);
  return STUDY_PROGRESS_FIELDS.filter(function hasCheckbox([key]): boolean {
    const value = fields[key];
    if (typeof value === 'boolean') return true;
    const unset = value === undefined || value === null || value === '';
    return unset && templateKeys.includes(key);
  }).map(function progressField([key, label]): StudyItemProgress {
    return { key, label, checked: fields[key] === true };
  });
}
