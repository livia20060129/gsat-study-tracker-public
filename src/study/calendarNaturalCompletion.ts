import type { StudyItem } from '../types.ts';

function setField(item: StudyItem, key: string, value: unknown): boolean {
  item.f ||= {};
  if (item.f[key] === value) return false;
  item.f[key] = value;
  return true;
}

/**
 * Full prior page coverage may suggest completion, but an explicit user
 * choice always wins. Separate markers are kept for the card completion and
 * its inner progress checkbox because either control can be changed alone.
 */
export function reconcileCalendarNaturalPriorCoverage(
  item: StudyItem,
  previouslyCovered: boolean,
): boolean {
  item.f ||= {};
  let changed = false;
  const userSetCompletion = item.f.calendarCompletionSetByUser === true;
  const userSetProgress = item.f.calendarProgressSetByUser === true;

  if (Object.prototype.hasOwnProperty.call(item.f, 'calendarAutoCompletionCleared')) {
    delete item.f.calendarAutoCompletionCleared;
    changed = true;
  }

  if (previouslyCovered) {
    if (!userSetCompletion) {
      if (!item.done) {
        item.done = true;
        changed = true;
      }
      changed = setField(item, 'calendarAutoCompletedDone', true) || changed;
    }
    if (!userSetProgress) {
      if (item.f.progress !== true) {
        item.f.progress = true;
        changed = true;
      }
      changed = setField(item, 'calendarAutoCompletedProgress', true) || changed;
    }
  } else {
    if (!userSetCompletion && item.f.calendarAutoCompletedDone === true && item.done) {
      item.done = false;
      changed = true;
    }
    if (!userSetProgress && item.f.calendarAutoCompletedProgress === true && item.f.progress === true) {
      item.f.progress = false;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(item.f, 'calendarAutoCompletedDone')) {
      delete item.f.calendarAutoCompletedDone;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(item.f, 'calendarAutoCompletedProgress')) {
      delete item.f.calendarAutoCompletedProgress;
      changed = true;
    }
  }

  changed = setField(item, 'calendarSuggestedAutoDone', previouslyCovered) || changed;
  changed = setField(item, 'calendarSuggestedPreviouslyCovered', previouslyCovered) || changed;
  return changed;
}

/** Marks card completion as a user's choice so later refreshes preserve it. */
export function markCalendarNaturalCompletionByUser(item: StudyItem, done: boolean): void {
  item.f ||= {};
  item.f.calendarCompletionSetByUser = true;
  item.f.calendarCompletionUserValue = done;
  delete item.f.calendarAutoCompletedDone;
}

/** Preserves a manual change to the inner progress checkbox across syncs. */
export function markCalendarNaturalProgressByUser(item: StudyItem, done: boolean): void {
  item.f ||= {};
  item.f.calendarProgressSetByUser = true;
  item.f.calendarProgressUserValue = done;
  delete item.f.calendarAutoCompletedProgress;
}
