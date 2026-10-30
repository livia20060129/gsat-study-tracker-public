import type { StudyItemFields } from '../types.ts';

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/**
 * Calendar may prefill a suggested range into start/end. That is a plan, not a
 * completed page record. A range becomes an actual record only after the user
 * edits at least one page boundary; dailyWorkUserFields preserves that edit in
 * Supabase and across regrouping/reloads. Non-suggested ranges are already
 * direct user records and can be counted as-is.
 */
export function recordedPageRangeFields(fields: StudyItemFields | undefined): StudyItemFields | null {
  if (!fields) return null;
  const hasSuggestion = fields.calendarSuggestedStart !== undefined
    || fields.calendarSuggestedEnd !== undefined
    || fields.calendarSuggestedRanges !== undefined;
  if (!hasSuggestion) return fields;

  const overrides = fields.dailyWorkUserFields;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return null;
  const values = overrides as Record<string, unknown>;
  if (!hasOwn(values, 'start') && !hasOwn(values, 'end')) return null;
  return {
    ...fields,
    // Older records used `true` as an "edited by the user" marker while the
    // actual value remained in fields.start/end. New records store the value
    // directly. Supporting both prevents a checked Calendar card from being
    // miscounted as page 1 instead of its recorded range.
    start: hasOwn(values, 'start') ? (values.start === true ? fields.start : values.start) : fields.start,
    end: hasOwn(values, 'end') ? (values.end === true ? fields.end : values.end) : fields.end,
  };
}
