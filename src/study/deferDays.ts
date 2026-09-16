const WEEK_DAYS_FROM_MONDAY = [1, 2, 3, 4, 5, 6, 0] as const;

export const DEFERRED_TARGET_LIMIT = 3 as const;

export interface DeferredTargetCandidate {
  id?: string;
  source?: string;
  required?: boolean;
  deferredCarry?: boolean;
  deferred?: boolean;
  done?: boolean;
  deferredTargetDay?: number;
  f?: {
    dailyWorkSourceItems?: DeferredTargetCandidate[];
    groupedWorkEntries?: DeferredTargetCandidate[];
    calendarMakeup?: boolean;
  };
}

export function isConfirmedDeferred(item: DeferredTargetCandidate): boolean {
  const targetDay = Number(item.deferredTargetDay);
  return item.deferred === true && (targetDay === 0 || (targetDay >= 2 && targetDay <= 6));
}

/** Includes independently displayed Calendar/grouped and carried-forward children. */
export function isDeferrableStudyItem(item: DeferredTargetCandidate): boolean {
  const supportedSource = item.source === 'preset' || item.source === 'groupedWork';
  const countsAsScheduledWork = item.required === true
    || item.deferredCarry === true
    || item.f?.calendarMakeup === true;
  return supportedSource && countsAsScheduledWork;
}

/** Returns only later days in the same Monday-to-Sunday week. */
export function futureDeferredDays(originDay: number): number[] {
  const originIndex = WEEK_DAYS_FROM_MONDAY.indexOf(
    originDay as (typeof WEEK_DAYS_FROM_MONDAY)[number]
  );

  if (originIndex < 0) return [];
  return WEEK_DAYS_FROM_MONDAY.slice(originIndex + 1);
}

export function nextDeferredDay(originDay: number): number | null {
  return futureDeferredDays(originDay)[0] ?? null;
}

/** Returns the real independently countable rows hidden inside merged parent cards. */
export function deferredCapacityCandidates(
  items: DeferredTargetCandidate[],
): DeferredTargetCandidate[] {
  const output: DeferredTargetCandidate[] = [];
  const visit = (item: DeferredTargetCandidate): void => {
    const sources = item.f?.dailyWorkSourceItems;
    if (Array.isArray(sources) && sources.length) {
      sources.forEach(visit);
      return;
    }
    const children = item.f?.groupedWorkEntries;
    if (Array.isArray(children) && children.length) {
      children.forEach(visit);
      return;
    }
    output.push(item);
  };
  items.forEach(visit);
  return output;
}

function excludedCandidateIds(item?: DeferredTargetCandidate): Set<string> {
  const ids = new Set<string>();
  if (!item) return ids;
  if (item.id) ids.add(item.id);
  deferredCapacityCandidates([item]).forEach(candidate => {
    if (candidate.id) ids.add(candidate.id);
  });
  return ids;
}

export function countDeferredToDay(
  items: DeferredTargetCandidate[],
  targetDay: number,
  excludedItem?: DeferredTargetCandidate
): number {
  const excludedIds = excludedCandidateIds(excludedItem);
  return deferredCapacityCandidates(items).filter(item =>
    item !== excludedItem &&
    !(item.id && excludedIds.has(item.id)) &&
    isDeferrableStudyItem(item) &&
    isConfirmedDeferred(item) &&
    !item.done &&
    Number(item.deferredTargetDay) === targetDay
  ).length;
}

export function hasDeferredTargetCapacity(
  items: DeferredTargetCandidate[],
  targetDay: number,
  excludedItem?: DeferredTargetCandidate
): boolean {
  return countDeferredToDay(items, targetDay, excludedItem) < DEFERRED_TARGET_LIMIT;
}

export function requiresDeferredLimitConfirmation(currentCount: number): boolean {
  return currentCount >= DEFERRED_TARGET_LIMIT;
}
