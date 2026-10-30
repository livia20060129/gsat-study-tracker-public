import type { StudyItem } from '../types.ts';

const INTERACTIVE_ITEM_TYPES = new Set([
  'interactive', 'interactiveDaily', 'mathOral', 'englishPractice', 'biologyInteractive', 'englishVocabInteractive',
]);

const INTERACTIVE_PRESET_KEYS = new Set([
  'daily_interactive', 'weekday_math_oral', 'fri_math_oral', 'sat_math_oral', 'sun_math_oral',
  'weekday_english_practice', 'fri_other', 'sat_english_practice', 'sun_english_practice',
]);

/** Interactive practice is daily optional work, including legacy and Calendar identities. */
export function isInteractiveStudyItem(item: Partial<StudyItem> | null | undefined): boolean {
  if (!item) return false;
  if (INTERACTIVE_ITEM_TYPES.has(String(item.type ?? '')) || item.mondayFixedVocab === true) return true;
  if (item.f?.calendarFixedTemplate === 'interactiveDaily' || Array.isArray(item.f?.interactiveEntries)) return true;
  if (INTERACTIVE_ITEM_TYPES.has(String(item.f?.interactiveType ?? ''))) return true;
  return [item.presetKey, item.templatePresetKey].some(key => (
    INTERACTIVE_PRESET_KEYS.has(String(key ?? '')) || /^cal_interactive_/.test(String(key ?? ''))
  )) || /互動題/.test(String(item.title ?? ''));
}
