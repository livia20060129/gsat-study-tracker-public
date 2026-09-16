import type { StudyItem } from '../types.ts';
import { calendarFixedTemplate } from '../calendar/calendarBridge.ts';
import { contiguousRangeClusters, numericPageRange } from './rangeMerge.ts';

function text(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableId(items: StudyItem[], kind: string): string {
  return `daily-${kind}-${items.map(item => item.id || item.presetKey || 'item').join('-')}`
    .replace(/[^A-Za-z0-9_-]/g, '_')
    .slice(0, 180);
}

/**
 * Fixed study cards can arrive from the preset, Calendar, or an earlier deferral.
 * Their visible titles have changed punctuation over time, so use the stable
 * Calendar template id whenever possible instead of treating title text as identity.
 */
function fixedTemplateIdentity(item: StudyItem): string {
  const declaredTemplate = text(item.f?.calendarFixedTemplate);
  const inferredTemplate = calendarFixedTemplate(text(item.title));
  return declaredTemplate || inferredTemplate || '';
}

function workTemplateIdentity(item: StudyItem): string {
  const fixedTemplate = fixedTemplateIdentity(item);
  if (fixedTemplate) return `fixed:${fixedTemplate}`;
  return text(item.title)
    .replace(/\s*第\s*\d+\s*回.*$/, '')
    .replace(/\s*Test\s*\d+.*$/i, '')
    .replace(/\s*[｜:：]\s*/g, '｜')
    .replace(/[＋+]/g, '＋');
}

function workIdentity(item: StudyItem): string {
  const fields = item.f || {};
  return JSON.stringify({
    type: item.type,
    template: workTemplateIdentity(item),
    material: text(fields.material),
    book: text(fields.book),
    itemTitle: text(fields.title),
    topic: text(fields.topic),
    subject: text(fields.subject),
    kind: text(fields.kind),
  });
}

function templateIdentity(item: StudyItem): string {
  return JSON.stringify({
    type: item.type,
    template: workTemplateIdentity(item),
  });
}

function isWeekly(item: StudyItem): boolean {
  return item.f?.calendarRoute === 'week';
}

function sourceItems(item: StudyItem): StudyItem[] {
  const sources = item.f?.dailyWorkSourceItems;
  return Array.isArray(sources) && sources.length ? sources : [item];
}

function uniqueText(values: unknown[]): string[] {
  return [...new Set(values.map(text).filter(Boolean))];
}

function preferredBase(items: StudyItem[]): StudyItem {
  return items.find(item => item.required && !item.deferredCarry)
    || items.find(item => !item.deferredCarry)
    || items[0];
}

function combinedItem(items: StudyItem[], kind: string): StudyItem {
  const base = preferredBase(items);
  const sources = items.flatMap(sourceItems);
  const descriptions = uniqueText(items.map(item => item.description));
  return {
    ...base,
    id: stableId(sources, kind),
    done: items.every(item => Boolean(item.done)),
    required: items.some(item => Boolean(item.required)),
    deferredCarry: items.every(item => Boolean(item.deferredCarry)),
    description: descriptions.join('｜'),
    f: {
      ...(base.f || {}),
      dailyWorkGroup: true,
      dailyWorkSourceItems: sources,
      dailyWorkIncludesDeferred: sources.some(item => Boolean(item.deferredCarry)),
    },
  };
}

function mergeRangeCluster(cluster: { items: StudyItem[]; range: { start: number; end: number } | null }): StudyItem {
  if (!cluster.range || cluster.items.length < 2) return cluster.items[0];
  const merged = combinedItem(cluster.items, 'range');
  merged.f.start = String(cluster.range.start);
  merged.f.end = String(cluster.range.end);
  merged.f.dailyWorkMergedRange = true;
  if (merged.f.calendarSuggestedStart !== undefined) merged.f.calendarSuggestedStart = cluster.range.start;
  if (merged.f.calendarSuggestedEnd !== undefined) merged.f.calendarSuggestedEnd = cluster.range.end;
  if (merged.f.calendarDailyPages !== undefined) merged.f.calendarDailyPages = cluster.range.end - cluster.range.start + 1;
  return merged;
}

function groupedChild(item: StudyItem, index: number): StudyItem {
  return {
    ...item,
    id: `${item.id || item.presetKey || 'item'}-daily-child-${index}`,
    calendarGroupedChild: true,
    f: {
      ...(item.f || {}),
      dailyWorkSourceItems: sourceItems(item),
    },
  } as StudyItem;
}

function groupSeparatedRanges(items: StudyItem[]): StudyItem[] {
  const buckets = new Map<string, Array<{ item: StudyItem; index: number }>>();
  items.forEach((item, index) => {
    if (isWeekly(item) || !numericPageRange(item.f) || Array.isArray(item.f?.groupedWorkEntries)) return;
    const key = workIdentity(item);
    const bucket = buckets.get(key) || [];
    bucket.push({ item, index });
    buckets.set(key, bucket);
  });
  const emitted = new Set<string>();
  const output: StudyItem[] = [];
  items.forEach((item, index) => {
    const key = workIdentity(item);
    const bucket = buckets.get(key) || [];
    if (!numericPageRange(item.f) || bucket.length < 2 || isWeekly(item) || Array.isArray(item.f?.groupedWorkEntries)) {
      output.push(item);
      return;
    }
    if (emitted.has(key)) return;
    emitted.add(key);
    const grouped = combinedItem(bucket.map(entry => entry.item), 'separated-range');
    grouped.f.groupedWorkEntries = bucket.map((entry, childIndex) => groupedChild(entry.item, childIndex));
    grouped.done = grouped.f.groupedWorkEntries.every(child => Boolean(child.done));
    output.push(grouped);
  });
  return output;
}

function roundIdentity(item: StudyItem): string {
  if (!text(item.f?.round) || isWeekly(item)) return '';
  return workIdentity(item);
}

function groupRounds(items: StudyItem[]): StudyItem[] {
  const buckets = new Map<string, StudyItem[]>();
  items.forEach(item => {
    const key = roundIdentity(item);
    if (!key || Array.isArray(item.f?.groupedWorkEntries)) return;
    const bucket = buckets.get(key) || [];
    bucket.push(item);
    buckets.set(key, bucket);
  });
  const emitted = new Set<string>();
  const output: StudyItem[] = [];
  for (const item of items) {
    const key = roundIdentity(item);
    const bucket = key ? buckets.get(key) || [] : [];
    if (!key || bucket.length < 2 || Array.isArray(item.f?.groupedWorkEntries)) {
      output.push(item);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const byRound = new Map<string, StudyItem[]>();
    bucket.forEach(entry => {
      const round = [text(entry.f?.topic), text(entry.f?.round)].filter(Boolean).join('｜');
      const sameRound = byRound.get(round) || [];
      sameRound.push(entry);
      byRound.set(round, sameRound);
    });
    if (byRound.size === 1) {
      output.push(combinedItem(bucket, 'same-round'));
      continue;
    }
    const roundItems = [...byRound.values()].map(entries => entries.length > 1 ? combinedItem(entries, 'same-round') : entries[0]);
    const grouped = combinedItem(bucket, 'rounds');
    grouped.title = text(grouped.title)
      .replace(/\s*第\s*\d+\s*回.*$/, '')
      .replace(/\s*Test\s*\d+.*$/i, '');
    grouped.f.groupedWorkEntries = roundItems.map(groupedChild);
    grouped.done = grouped.f.groupedWorkEntries.every(child => Boolean(child.done));
    output.push(grouped);
  }
  return output;
}

function hasConcreteScope(item: StudyItem): boolean {
  return Boolean(
    numericPageRange(item.f)
    || text(item.f?.round)
    || (Array.isArray(item.f?.groupedWorkEntries) && item.f.groupedWorkEntries.length),
  );
}

function isBlankScheduledTemplate(item: StudyItem): boolean {
  return !isWeekly(item)
    && item.source === 'preset'
    && item.required
    && !item.deferredCarry
    && !hasConcreteScope(item);
}

function templateChildren(item: StudyItem): StudyItem[] {
  const children = item.f?.groupedWorkEntries;
  return Array.isArray(children) && children.length ? children : [item];
}

function templateLeaves(item: StudyItem, visited = new Set<StudyItem>()): StudyItem[] {
  if (!item || visited.has(item)) return [];
  visited.add(item);
  const children = item.f?.groupedWorkEntries;
  if (Array.isArray(children) && children.length) {
    return children.flatMap(child => templateLeaves(child, visited));
  }
  const sources = item.f?.dailyWorkSourceItems;
  if (Array.isArray(sources) && sources.length) {
    return sources.flatMap(source => templateLeaves(source, visited));
  }
  return [item];
}

/** Math-practice is intentionally a single completion card, even with many sources. */
function mergeMathPracticeTemplate(items: StudyItem[]): StudyItem {
  const merged = combinedItem(items, 'math-practice-template');
  const leaves = items.flatMap(item => templateLeaves(item));
  const ranged = leaves
    .map(item => ({ item, range: numericPageRange(item.f) }))
    .filter((entry): entry is { item: StudyItem; range: { start: number; end: number } } => Boolean(entry.range));
  const scopedBase = ranged.length ? preferredBase(ranged.map(entry => entry.item)) : null;

  if (scopedBase) {
    for (const field of ['material', 'book', 'unit', 'chapter', 'reason', 'corrected', 'review', 'extended'] as const) {
      if (!text(merged.f[field]) && scopedBase.f?.[field] !== undefined) merged.f[field] = scopedBase.f[field];
    }
  }
  if (ranged.length) {
    merged.f.start = String(Math.min(...ranged.map(entry => entry.range.start)));
    merged.f.end = String(Math.max(...ranged.map(entry => entry.range.end)));
  }

  delete merged.f.groupedWorkEntries;
  delete merged.f.calendarGroupedWork;
  delete merged.f.dailyWorkBlankTemplate;
  merged.f.dailyWorkFlatTemplate = true;
  merged.f.dailyWorkIncludesDeferred = leaves.some(item => Boolean(item.deferredCarry)
    || item.f?.calendarMakeup === true
    || item.f?.dailyWorkIncludesDeferred === true);
  merged.done = leaves.length > 0 && leaves.every(item => Boolean(item.done));
  return merged;
}

/**
 * A built-in daily template can be intentionally blank while Calendar or deferred
 * copies of the same work already contain concrete ranges/rounds. A Calendar merge
 * can also fill the built-in card before this pass. Keep every instance of the same
 * fixed template in one card, but preserve distinct scopes as completion units.
 */
function groupBlankScheduledTemplates(items: StudyItem[]): StudyItem[] {
  const buckets = new Map<string, StudyItem[]>();
  items.forEach(item => {
    if (isWeekly(item)) return;
    const key = templateIdentity(item);
    const bucket = buckets.get(key) || [];
    bucket.push(item);
    buckets.set(key, bucket);
  });

  const selectedByKey = new Map<string, StudyItem[]>();
  for (const [key, bucket] of buckets) {
    const blanks = bucket.filter(isBlankScheduledTemplate);
    const scoped = bucket.filter(item => !isBlankScheduledTemplate(item) && hasConcreteScope(item));
    const mathPractice = bucket.some(item => fixedTemplateIdentity(item) === 'mathPractice');
    const sameFixedTemplate = bucket.length > 1 && bucket.some(item => Boolean(fixedTemplateIdentity(item)));
    if (mathPractice && (bucket.length > 1 || bucket.some(item => Array.isArray(item.f?.groupedWorkEntries)))) {
      selectedByKey.set(key, bucket);
    } else if (sameFixedTemplate) {
      selectedByKey.set(key, bucket);
    } else if (blanks.length && scoped.length) {
      const selected = new Set([...blanks, ...scoped]);
      selectedByKey.set(key, bucket.filter(item => selected.has(item)));
    }
  }

  const emitted = new Set<string>();
  const output: StudyItem[] = [];
  for (const item of items) {
    const key = templateIdentity(item);
    const selected = selectedByKey.get(key);
    if (!selected || !selected.includes(item)) {
      output.push(item);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    if (selected.some(entry => fixedTemplateIdentity(entry) === 'mathPractice')) {
      output.push(mergeMathPracticeTemplate(selected));
      continue;
    }
    const grouped = combinedItem(selected, 'scheduled-template');
    grouped.f.groupedWorkEntries = selected.flatMap(templateChildren).map((entry, childIndex) => {
      const child = groupedChild(entry, childIndex);
      if (isBlankScheduledTemplate(entry)) child.f.dailyWorkBlankTemplate = true;
      return child;
    });
    grouped.done = grouped.f.groupedWorkEntries.every(child => Boolean(child.done));
    output.push(grouped);
  }
  return output;
}

/** Restores the original top-level items before Calendar/deferred reconciliation. */
export function ungroupDailyWorkItems(items: StudyItem[]): StudyItem[] {
  return items.flatMap(item => item.f?.dailyWorkGroup ? sourceItems(item) : [item]);
}

/** Final daily pass: merge work regardless of whether it came from Calendar or a deferral. */
export function groupDailyWorkItems(items: StudyItem[]): StudyItem[] {
  const ranged = contiguousRangeClusters(
    items,
    workIdentity,
    item => isWeekly(item) || Array.isArray(item.f?.groupedWorkEntries) ? null : numericPageRange(item.f),
  ).map(mergeRangeCluster);
  return groupBlankScheduledTemplates(groupRounds(groupSeparatedRanges(ranged)));
}

/** Keeps the hidden source records in sync with a merged card or child checkbox. */
export function propagateDailyWorkDone(item: StudyItem, done: boolean): void {
  const visited = new Set<StudyItem>();
  const apply = (target: StudyItem): void => {
    if (!target || visited.has(target)) return;
    visited.add(target);
    target.done = done;
    const sources = target.f?.dailyWorkSourceItems;
    if (Array.isArray(sources)) sources.forEach(apply);
    const children = target.f?.groupedWorkEntries;
    if (Array.isArray(children)) children.forEach(apply);
  };
  apply(item);
}

/** Keeps completion-date metadata on every hidden source represented by a card. */
export function propagateDailyWorkCompletionDates(
  item: StudyItem,
  checkedOn?: string,
  deferredCompletedOn?: string,
): void {
  const visited = new Set<StudyItem>();
  const apply = (target: StudyItem): void => {
    if (!target || visited.has(target)) return;
    visited.add(target);
    if (checkedOn) target.checkedOn = checkedOn;
    else delete target.checkedOn;
    if (deferredCompletedOn) target.deferredCompletedOn = deferredCompletedOn;
    else delete target.deferredCompletedOn;
    const sources = target.f?.dailyWorkSourceItems;
    if (Array.isArray(sources)) sources.forEach(apply);
    const children = target.f?.groupedWorkEntries;
    if (Array.isArray(children)) children.forEach(apply);
  };
  apply(item);
}

/** Stores a merged card's minutes on the same preferred source used when rebuilding it. */
export function propagateDailyWorkMinutes(item: StudyItem, minutes: string): void {
  item.minutes = minutes;
  const sources = item.f?.dailyWorkSourceItems;
  if (!Array.isArray(sources) || !sources.length) return;
  preferredBase(sources).minutes = minutes;
}

/**
 * Replaces a card's previously entered minutes with a completed timer result.
 * Clearing represented sources first prevents an older manual value from
 * reappearing when Calendar or deferred work is grouped again.
 */
export function replaceDailyWorkMinutes(item: StudyItem, minutes: string): void {
  item.minutes = minutes;
  const sources = item.f?.dailyWorkSourceItems;
  if (!Array.isArray(sources) || !sources.length) return;
  const leaves = sources.flatMap(source => templateLeaves(source));
  const candidates = leaves.length ? leaves : sources;
  candidates.forEach(source => { source.minutes = ''; });
  preferredBase(candidates).minutes = minutes;
}

function cloneFieldValue(value: unknown): unknown {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Stores an edited form field on the hidden source records used to rebuild a
 * merged card. Grouped children may represent several equivalent Calendar
 * records, so every represented source receives the edit. A flat aggregate
 * keeps the value on its preferred source, matching the minutes behaviour.
 */
export function propagateDailyWorkField(
  item: StudyItem,
  field: string,
  value: unknown,
): void {
  item.f ||= {};
  item.f[field] = cloneFieldValue(value);

  const sources = item.f.dailyWorkSourceItems;
  if (!Array.isArray(sources) || !sources.length) return;

  const leaves = sources.flatMap(source => templateLeaves(source));
  const candidates = leaves.length ? leaves : sources;
  const targets = item.calendarGroupedChild ? candidates : [preferredBase(candidates)];
  for (const target of targets) {
    target.f ||= {};
    target.f[field] = cloneFieldValue(value);
  }
}

function storeUserFieldOverride(item: StudyItem, field: 'start' | 'end', value: unknown): void {
  item.f ||= {};
  const existing = item.f.dailyWorkUserFields;
  item.f.dailyWorkUserFields = {
    ...(existing && typeof existing === 'object' && !Array.isArray(existing)
      ? existing as Record<string, unknown>
      : {}),
    [field]: value,
  };
}

/**
 * Stores an edited range boundary on the source item that owns that edge.
 * The displayed aggregate is rebuilt frequently, so changing only its fields
 * would otherwise make the value snap back after a reload.
 */
export function propagateDailyWorkRangeField(
  item: StudyItem,
  field: 'start' | 'end',
  value: unknown,
): void {
  item.f ||= {};
  item.f[field] = value;
  storeUserFieldOverride(item, field, value);

  const sources = item.f.dailyWorkSourceItems;
  if (!Array.isArray(sources) || !sources.length) return;
  const leaves = sources.flatMap(source => templateLeaves(source));
  const ranged = leaves
    .map(source => ({ source, range: numericPageRange(source.f) }))
    .filter((entry): entry is { source: StudyItem; range: { start: number; end: number } } => Boolean(entry.range));

  let target = preferredBase(sources);
  if (ranged.length) {
    const edge = field === 'start'
      ? Math.min(...ranged.map(entry => entry.range.start))
      : Math.max(...ranged.map(entry => entry.range.end));
    const edgeSources = ranged
      .filter(entry => entry.range[field] === edge)
      .map(entry => entry.source);
    target = preferredBase(edgeSources);
  }

  target.f ||= {};
  target.f[field] = value;
  storeUserFieldOverride(target, field, value);
}

/** Restores explicit local range edits after a Calendar definition refresh. */
export function applyDailyWorkRangeOverrides(item: StudyItem): void {
  item.f ||= {};
  const overrides = item.f.dailyWorkUserFields;
  if (overrides && typeof overrides === 'object' && !Array.isArray(overrides)) {
    const fields = overrides as Record<string, unknown>;
    for (const field of ['start', 'end'] as const) {
      if (Object.prototype.hasOwnProperty.call(fields, field)) item.f[field] = fields[field];
    }
  }
  const children = item.f.groupedWorkEntries;
  if (Array.isArray(children)) children.forEach(applyDailyWorkRangeOverrides);
}

/** Applies a child card's confirmed deferral to every hidden source represented by it. */
export function propagateDailyWorkDeferred(
  item: StudyItem,
  deferred: boolean,
  targetDay?: number,
): void {
  const visited = new Set<StudyItem>();
  const apply = (target: StudyItem): void => {
    if (!target || visited.has(target)) return;
    visited.add(target);
    target.deferred = deferred;
    if (deferred) {
      target.done = false;
      target.deferredTargetDay = targetDay;
    } else {
      delete target.deferredTargetDay;
    }
    const sources = target.f?.dailyWorkSourceItems;
    if (Array.isArray(sources)) sources.forEach(apply);
    const children = target.f?.groupedWorkEntries;
    if (Array.isArray(children)) children.forEach(apply);
  };
  apply(item);
}
