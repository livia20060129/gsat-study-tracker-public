import type { StudyItem } from '../types.ts';
import { isConfirmedDeferred } from './deferDays.ts';
import {
  applyCompletionDateChange,
  deferredCompletionDate,
  manualCompletionDateChange,
  type ManualCompletionDateChange,
} from './completionCheckedOn.ts';

const COMPLETION_CHILD_FIELDS = [
  'groupedWorkEntries',
  'interactiveEntries',
  'calendarIntegrationEntries',
  'makeupEntries',
] as const;

export interface DeferredCompletionRequest {
  carrier: StudyItem;
  target: StudyItem;
  change: ManualCompletionDateChange;
  previousDeferredCompletedOn?: string;
}

export function completionChildItems(item: StudyItem, includeSources = false): StudyItem[] {
  const fields = includeSources
    ? [...COMPLETION_CHILD_FIELDS, 'dailyWorkSourceItems']
    : COMPLETION_CHILD_FIELDS;
  return fields.flatMap(function childrenForField(field): StudyItem[] {
    const value = item.f?.[field];
    return Array.isArray(value) ? value.filter(Boolean) as StudyItem[] : [];
  });
}

export function findCompletionItem(
  items: StudyItem[],
  targetId: string,
  visited = new Set<StudyItem>(),
): StudyItem | null {
  for (const item of items) {
    if (!item || visited.has(item)) continue;
    visited.add(item);
    if (item.id === targetId) return item;
    const found = findCompletionItem(completionChildItems(item, true), targetId, visited);
    if (found) return found;
  }
  return null;
}

export function deferredCarrierForItem(items: StudyItem[], target: StudyItem): StudyItem | null {
  const visited = new Set<StudyItem>();
  function visit(children: StudyItem[], inherited: StudyItem | null): StudyItem | null | undefined {
    for (const item of children) {
      if (!item || visited.has(item)) continue;
      visited.add(item);
      const carrier = item.deferredCarry ? item : inherited;
      if (item === target) return carrier;
      const nested = visit(completionChildItems(item, true), carrier);
      if (nested !== undefined) return nested;
    }
    return undefined;
  }
  return visit(items, null) ?? null;
}

/** Applies one manual checkbox action to the visible item and represented source rows. */
export function applyManualCompletionMetadata(
  item: StudyItem,
  checked: boolean,
  recordDate: string,
  actionDate: string,
  rootItems: StudyItem[],
): DeferredCompletionRequest[] {
  const requests: DeferredCompletionRequest[] = [];
  const visited = new Set<StudyItem>();
  const ancestor = deferredCarrierForItem(rootItems, item);

  function visit(target: StudyItem, inheritedCarrier: StudyItem | null): void {
    if (!target || visited.has(target)) return;
    visited.add(target);
    const carrier = target.deferredCarry ? target : inheritedCarrier;
    const previousDeferredCompletedOn = target.deferredCompletedOn || deferredCompletionDate(target);
    const change = manualCompletionDateChange({
      checked,
      recordDate,
      actionDate,
      deferredCarry: Boolean(carrier),
      confirmedDeferred: isConfirmedDeferred(target),
      previousDeferredCompletedOn,
    });
    applyCompletionDateChange(target, change);

    const represented = completionChildItems(target, true);
    if (change.syncDeferredOrigin && carrier && represented.length === 0) {
      requests.push({ carrier, target, change, previousDeferredCompletedOn });
    }
    represented.forEach(function visitRepresentedItem(child): void {
      visit(child, carrier);
    });
  }

  visit(item, ancestor);
  return requests;
}

function nonEmptyStrings(values: unknown[]): string[] {
  return [...new Set(values.map(function normalizeString(value): string {
    return String(value ?? '').trim();
  }).filter(Boolean))];
}

function calendarEventKeys(item: StudyItem): string[] {
  const fields = item.f ?? {};
  return nonEmptyStrings([
    ...(Array.isArray(fields.calendarEventKeys) ? fields.calendarEventKeys : []),
    fields.calendarEventKey,
  ]);
}

function matchingCalendarEvent(candidate: StudyItem, target: StudyItem): boolean {
  const targetKeys = new Set(calendarEventKeys(target));
  return calendarEventKeys(candidate).some(function hasTargetKey(key): boolean {
    return targetKeys.has(key);
  });
}

function matchingDeferredOrigin(candidate: StudyItem, target: StudyItem): boolean {
  const targetOrigins = new Set(deferredOriginIds(target));
  return deferredOriginIds(candidate).some(function hasTargetOrigin(originId): boolean {
    return targetOrigins.has(originId);
  });
}

function completionIdentityMatches(candidate: StudyItem, target: StudyItem): boolean {
  if (candidate.id && candidate.id === target.id) return true;
  if (candidate.presetKey && target.presetKey && candidate.presetKey === target.presetKey) return true;
  const candidateFields = candidate.f ?? {};
  const targetFields = target.f ?? {};
  const candidateRound = String(candidateFields.round ?? '').trim();
  const targetRound = String(targetFields.round ?? '').trim();
  const candidateSection = String(candidateFields.azarSectionCode ?? '').trim();
  const targetSection = String(targetFields.azarSectionCode ?? '').trim();
  if (candidateSection && targetSection) {
    return candidate.type === target.type && candidateSection === targetSection;
  }
  if (matchingCalendarEvent(candidate, target)) {
    if (!candidateRound || !targetRound) return true;
    return candidate.type === target.type
      && candidateRound === targetRound
      && String(candidateFields.topic ?? '').trim() === String(targetFields.topic ?? '').trim()
      && String(candidateFields.book ?? candidateFields.title ?? '').trim()
        === String(targetFields.book ?? targetFields.title ?? '').trim();
  }
  if (matchingDeferredOrigin(candidate, target)) return true;
  if (candidateRound && targetRound) {
    return candidate.type === target.type
      && candidateRound === targetRound
      && String(candidateFields.topic ?? '').trim() === String(targetFields.topic ?? '').trim()
      && String(candidateFields.book ?? candidateFields.title ?? '').trim()
        === String(targetFields.book ?? targetFields.title ?? '').trim();
  }
  return Boolean(candidateFields.start && candidateFields.end && targetFields.start && targetFields.end)
    && candidate.type === target.type
    && String(candidateFields.start) === String(targetFields.start)
    && String(candidateFields.end) === String(targetFields.end);
}

function deferredOriginIds(item: StudyItem): string[] {
  const ids = Array.isArray(item.deferredOriginIds)
    ? item.deferredOriginIds.map(String)
    : [];
  if (item.deferredOriginId) ids.unshift(String(item.deferredOriginId));
  return [...new Set(ids.filter(Boolean))];
}

export function completionTargetWithinOrigin(
  originRoot: StudyItem | null | undefined,
  target: StudyItem,
  carrier: StudyItem,
): StudyItem | null {
  if (!originRoot) return null;
  if (target === carrier || target.id === carrier.id) return originRoot;
  const exact = findCompletionItem([originRoot], target.id);
  if (exact && exact !== originRoot) return exact;
  for (const originId of deferredOriginIds(target)) {
    const byOrigin = findCompletionItem([originRoot], originId);
    if (byOrigin) return byOrigin;
  }
  const candidates: StudyItem[] = [];
  const visited = new Set<StudyItem>();
  function collect(item: StudyItem): void {
    if (!item || visited.has(item)) return;
    visited.add(item);
    candidates.push(item);
    completionChildItems(item, true).forEach(collect);
  }
  collect(originRoot);
  return candidates.find(function matchesTarget(candidate): boolean {
    return candidate !== originRoot && completionIdentityMatches(candidate, target);
  }) ?? null;
}

/** Refreshes every visible representation, deriving aggregate state from canonical sources first. */
export function refreshCompletionTree(item: StudyItem, visited = new Set<StudyItem>()): void {
  if (!item || visited.has(item)) return;
  visited.add(item);
  const fields = item.f ?? {};
  completionChildItems(item, true).forEach(function refreshChild(child): void {
    refreshCompletionTree(child, visited);
  });
  const groups = [
    fields.dailyWorkSourceItems,
    fields.groupedWorkEntries,
    fields.calendarIntegrationEntries,
    fields.interactiveEntries,
  ].find(function hasItems(value): boolean {
    return Array.isArray(value) && value.length > 0;
  }) as StudyItem[] | undefined;
  if (!groups) return;
  item.done = groups.every(function isComplete(child): boolean {
    return Boolean(child.done);
  });
  if (Array.isArray(fields.dailyWorkSourceItems) && fields.dailyWorkSourceItems.length) {
    for (const field of ['checkedOn', 'deferredCompletedOn'] as const) {
      const dates = groups.map(function completionDate(child): string {
        return child[field] ?? '';
      }).filter(Boolean).sort();
      if (item.done && dates.length) item[field] = dates[dates.length - 1];
      else delete item[field];
    }
  }
}
