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
 * Normal work records only a late check; deferred carry work records the
 * actual completion date on or after its target day and asks the runtime to
 * mirror that completion back to the original record.
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
    if (input.actionDate < input.recordDate) return { syncDeferredOrigin: false };
    return {
      checkedOn: input.actionDate,
      deferredCompletedOn: input.actionDate,
      syncDeferredOrigin: true,
    };
  }
  if (input.confirmedDeferred || input.actionDate <= input.recordDate) {
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
    return item.deferredCompletedOn === item.checkedOn
      ? `延期完成：${item.checkedOn}`
      : `${item.checkedOn} 勾選`;
  }
  for (const child of nestedItems(item)) {
    const label = completionDateLabel(child);
    if (label) return label;
  }
  return '';
}
