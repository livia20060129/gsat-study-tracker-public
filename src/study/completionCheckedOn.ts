import type { StudyItem } from '../types.ts';

const STUDY_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ManualCompletionDateChange {
  checkedOn?: string;
  deferredCompletedOn?: string;
  syncDeferredOrigin: boolean;
}

export interface ManualCompletionDateInput {
  checked: boolean;
  recordDate: string;
  actionDate: string;
  deferredCarry: boolean;
  confirmedDeferred: boolean;
  previousDeferredCompletedOn?: string;
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && STUDY_DATE.test(value);
}

/**
 * Resolves the date metadata for a user-triggered completion checkbox.
 * Normal work records every check made on a date other than the scheduled
 * record date. Deferred carry work always records the actual check date and
 * asks the runtime to mirror that completion back to the original record.
 */
export function manualCompletionDateChange(input: ManualCompletionDateInput): ManualCompletionDateChange {
  const previousDeferredDate = validDate(input.previousDeferredCompletedOn)
    ? input.previousDeferredCompletedOn
    : undefined;
  if (!input.checked) {
    return {
      syncDeferredOrigin: input.deferredCarry && Boolean(previousDeferredDate),
    };
  }
  if (!validDate(input.recordDate) || !validDate(input.actionDate)) {
    return { syncDeferredOrigin: false };
  }
  if (input.deferredCarry) {
    return {
      checkedOn: input.actionDate,
      deferredCompletedOn: input.actionDate,
      syncDeferredOrigin: true,
    };
  }
  if (input.confirmedDeferred || input.actionDate === input.recordDate) {
    return { syncDeferredOrigin: false };
  }
  return {
    checkedOn: input.actionDate,
    syncDeferredOrigin: false,
  };
}

export function applyCompletionDateChange(
  item: StudyItem,
  change: Pick<ManualCompletionDateChange, 'checkedOn' | 'deferredCompletedOn'>,
): void {
  if (change.checkedOn) item.checkedOn = change.checkedOn;
  else delete item.checkedOn;
  if (change.deferredCompletedOn) item.deferredCompletedOn = change.deferredCompletedOn;
  else delete item.deferredCompletedOn;
}

function nestedItems(item: StudyItem): StudyItem[] {
  const fields = item.f || {};
  return ['groupedWorkEntries', 'dailyWorkSourceItems', 'interactiveEntries', 'calendarIntegrationEntries', 'makeupEntries']
    .flatMap(key => Array.isArray(fields[key]) ? fields[key] as StudyItem[] : []);
}

/** Finds the deferred completion date even when only a child card was checked. */
export function deferredCompletionDate(item: StudyItem | null | undefined): string | undefined {
  if (!item) return undefined;
  if (validDate(item.deferredCompletedOn)) return item.deferredCompletedOn;
  for (const child of nestedItems(item)) {
    const value = deferredCompletionDate(child);
    if (value) return value;
  }
  return undefined;
}

export function completionDateLabel(item: StudyItem | null | undefined): string {
  if (!item) return '';
  if (validDate(item.checkedOn)) {
    return `完成日期：${item.checkedOn}`;
  }
  for (const child of nestedItems(item)) {
    const label = completionDateLabel(child);
    if (label) return label;
  }
  return '';
}

/** Returns the date shown by the completion-date editor for a completed item. */
export function completionDateValue(
  item: StudyItem | null | undefined,
  recordDate: string,
): string {
  if (!item?.done) return '';
  if (validDate(item.checkedOn)) return item.checkedOn;
  if (validDate(item.deferredCompletedOn)) return item.deferredCompletedOn;
  return validDate(recordDate) ? recordDate : '';
}

/**
 * Returns whether an item was already complete at the requested snapshot date.
 * Older records may not have completion metadata, so their scheduled record
 * date remains the compatibility fallback.
 */
export function isCompletedByDate(
  item: StudyItem | null | undefined,
  recordDate: string,
  cutoffDate?: string,
): boolean {
  if (!item?.done) return false;
  if (!validDate(cutoffDate)) return true;
  let completedOn = recordDate;
  if (validDate(item.checkedOn)) completedOn = item.checkedOn;
  else if (validDate(item.deferredCompletedOn)) completedOn = item.deferredCompletedOn;
  return !validDate(completedOn) || completedOn <= cutoffDate;
}
