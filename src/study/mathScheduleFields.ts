import type { StudyItem } from '../types.ts';

const MATH_TYPES = new Set(['mathStudy', 'mathLecture', 'mathPractice']);
const SCHEDULE_FIELDS = ['material', 'book', 'start', 'end', 'calendarPlanTitle', 'calendarSuggestedStart',
  'calendarSuggestedEnd', 'calendarSuggestedMaterial', 'calendarSuggestedBook', 'calendarRangeSource', 'calendarDailyPages'] as const;
const RANGE_FIELDS = new Set(['start', 'end', 'calendarSuggestedStart', 'calendarSuggestedEnd', 'calendarDailyPages', 'calendarRangeSource']);

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== '' && String(value) !== '0';
}

/** A failed refresh must not erase known math pages; explicit edits, including blanks, stay local. */
export function restoreMathScheduleFields(merged: Pick<StudyItem, 'type' | 'f'>, template: Pick<StudyItem, 'type' | 'f'>, existing: Pick<StudyItem, 'type' | 'f'>): void {
  if (!MATH_TYPES.has(template.type)) return;
  const overrides = existing.f?.dailyWorkUserFields;
  const sameMaterial = ['material', 'book'].every(key => !hasValue(template.f[key]) || !hasValue(existing.f[key])
    || String(template.f[key]).normalize('NFKC') === String(existing.f[key]).normalize('NFKC'));
  for (const key of SCHEDULE_FIELDS) {
    const overridden = overrides && typeof overrides === 'object' && Object.prototype.hasOwnProperty.call(overrides, key);
    if (overridden) {
      merged.f[key] = existing.f[key];
    } else if (!sameMaterial && RANGE_FIELDS.has(key) && !hasValue(template.f[key])) {
      merged.f[key] = template.f[key] ?? '';
    } else if (hasValue(template.f?.[key])) {
      merged.f[key] = template.f[key];
    } else if (hasValue(existing.f?.[key])) {
      merged.f[key] = existing.f[key];
    }
  }
}
