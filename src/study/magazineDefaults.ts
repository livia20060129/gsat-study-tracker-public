type MagazineFields = Record<string, unknown> & {
  month?: unknown;
  magazineMonthInitialized?: unknown;
};

/** Returns the month represented by a Tracker study date. */
export function magazineMonthForDate(studyDate: string): string {
  const match = String(studyDate || '').match(/^\d{4}-(\d{2})-\d{2}$/);
  const month = match ? Number(match[1]) : 0;
  return Number.isInteger(month) && month >= 1 && month <= 12 ? String(month) : '';
}

/**
 * Applies the selected date's month once. After initialization, even an empty
 * user-edited value is preserved instead of being automatically replaced.
 */
export function initializeMagazineMonth(fields: MagazineFields, studyDate: string): boolean {
  if (!fields || fields.magazineMonthInitialized === true) return false;
  if (fields.month === undefined || fields.month === null || fields.month === '') {
    const month = magazineMonthForDate(studyDate);
    if (month) fields.month = month;
  }
  fields.magazineMonthInitialized = true;
  return true;
}
