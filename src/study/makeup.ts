import type { StudyItem } from '../types';
import { contiguousRangeClusters, numericPageRange } from './rangeMerge.ts';

export interface MakeupCloneOptions {
  id: string;
  presetKey: string;
  originDate: string;
}

function cloneJson<T>(value: T): T {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Refresh inherited Calendar pages, without discarding edits made on the makeup card. */
function restoreNaturalCalendarSchedule(merged: StudyItem, template: StudyItem): void {
  if (template.type !== 'scienceReview' || template.f?.calendarRangeSource !== 'calendar'
    || !template.f.calendarEventKey) return;
  const overrides = merged.f.dailyWorkUserFields;
  for (const key of ['start', 'end', 'material', 'subject', 'calendarTopic', 'calendarRangeSource',
    'calendarSuggestedMaterial', 'calendarSuggestedRanges', 'calendarSuggestedLabel', 'calendarSuggestedBasis']) {
    if (template.f[key] === undefined) continue;
    merged.f[key] = cloneJson(template.f[key]);
    if ((key === 'start' || key === 'end') && overrides && typeof overrides === 'object'
      && Object.prototype.hasOwnProperty.call(overrides, key)) {
      merged.f[key] = (overrides as Record<string, unknown>)[key];
    }
  }
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.flatMap(value => Array.isArray(value) ? value : [value])
    .map(value => String(value ?? '').trim())
    .filter(Boolean))];
}

function deferredRangeIdentity(item: StudyItem): string {
  const fields = item.f || {};
  return JSON.stringify({
    type: item.type,
    title: String(item.title || '').trim(),
    material: String(fields.material || '').trim(),
    book: String(fields.book || '').trim(),
    itemTitle: String(fields.title || '').trim(),
    topic: String(fields.topic || '').trim(),
    subject: String(fields.subject || '').trim(),
    kind: String(fields.kind || '').trim(),
    fixedTemplate: String(fields.calendarFixedTemplate || '').trim(),
    grammarTitle: String(fields.calendarGrammarTitle || '').trim(),
  });
}

function deferredRoundIdentity(item: StudyItem): string {
  const fields = item.f || {};
  if (!String(fields.round || '').trim()) return '';
  return JSON.stringify({
    type: item.type,
    title: String(fields.title || item.title || '')
      .replace(/\s*第\s*\d+\s*回.*$/, '')
      .replace(/\s*Test\s*\d+.*$/i, '')
      .trim(),
    book: String(fields.book || '').trim(),
    topic: String(fields.topic || '').trim(),
    kind: String(fields.kind || '').trim(),
    fixedTemplate: String(fields.calendarFixedTemplate || '').trim(),
  });
}

function groupedEntryMatches(template: StudyItem, existing: StudyItem): boolean {
  if (template.id && template.id === existing.id) return true;
  if (template.presetKey && template.presetKey === existing.presetKey) return true;
  const templateOrigins = uniqueStrings([template.deferredOriginIds, template.deferredOriginId]);
  const existingOrigins = uniqueStrings([existing.deferredOriginIds, existing.deferredOriginId]);
  if (templateOrigins.some(id => existingOrigins.includes(id))) return true;
  const templateEvents = uniqueStrings([template.f?.calendarEventKeys, template.f?.calendarEventKey]);
  const existingEvents = uniqueStrings([existing.f?.calendarEventKeys, existing.f?.calendarEventKey]);
  if (templateEvents.some(key => existingEvents.includes(key))) return true;
  const templateRange = numericPageRange(template.f);
  const existingRange = numericPageRange(existing.f);
  if (templateRange && existingRange) {
    return deferredRangeIdentity(template) === deferredRangeIdentity(existing)
      && templateRange.start === existingRange.start
      && templateRange.end === existingRange.end;
  }
  return deferredRoundIdentity(template) !== ''
    && deferredRoundIdentity(template) === deferredRoundIdentity(existing)
    && String(template.f?.round || '') === String(existing.f?.round || '');
}

function mergeGroupedEntryProgress(templateEntries: StudyItem[], existingEntries: StudyItem[]): StudyItem[] {
  const used = new Set<number>();
  return templateEntries.map(template => {
    const index = existingEntries.findIndex((entry, candidate) => !used.has(candidate) && groupedEntryMatches(template, entry));
    if (index < 0) return cloneJson(template);
    used.add(index);
    const existing = existingEntries[index];
    const merged = cloneJson(template);
    merged.done = Boolean(existing.done);
    merged.minutes = existing.minutes || '';
    if (existing.checkedOn) merged.checkedOn = existing.checkedOn;
    else delete merged.checkedOn;
    if (existing.deferredCompletedOn) merged.deferredCompletedOn = existing.deferredCompletedOn;
    else delete merged.deferredCompletedOn;
    merged.f = { ...cloneJson(template.f || {}), ...cloneJson(existing.f || {}) };
    for (const key of ['title', 'book', 'topic', 'start', 'end', 'round', 'calendarBookRangeLocked', 'calendarMathMaterialLocked', 'calendarScopeParseError', 'calendarEventId', 'calendarEventIds', 'calendarEventKey', 'calendarEventKeys', 'calendarSourceDate', 'calendarSourceDates']) {
      if (template.f?.[key] !== undefined) merged.f[key] = cloneJson(template.f[key]);
    }
    restoreNaturalCalendarSchedule(merged, template);
    return merged;
  });
}

function originalDescription(value: unknown): string {
  return String(value ?? '').replace(/^延期自\s*[^｜]+(?:｜|$)/, '').trim();
}

/** Returns the preset that owns the item's UI template, including carried makeup items. */
export function effectiveTemplatePresetKey(item: Pick<StudyItem, 'presetKey' | 'templatePresetKey'> | null | undefined): string {
  return String(item?.templatePresetKey || item?.presetKey || '');
}

export type SpecialItemTemplate = 'englishReview' | 'interactiveDaily' | 'fixedMagazine' | '';

/** Resolves templates whose UI cannot be determined from the broad subject type alone. */
export function specialItemTemplate(item: StudyItem | null | undefined): SpecialItemTemplate {
  if (!item) return '';
  const key = effectiveTemplatePresetKey(item);
  if (item.type === 'interactiveDaily') return 'interactiveDaily';
  if (item.type === 'general' && (
    item.title === '英文訂正與搭配詞整理' ||
    key === 'weekday_english_review' ||
    /^cal_english_review_/.test(key)
  )) return 'englishReview';
  if (item.type === 'magazine' && (
    item.title === '學測英文訓練：英文雜誌' ||
    key === 'weekday_magazine' ||
    key === 'fri_magazine' ||
    /^cal_magazine_/.test(key)
  )) return 'fixedMagazine';
  return '';
}

/** Creates a makeup item without flattening the original item into a generic blank form. */
export function cloneOriginalItemForMakeup(original: StudyItem, options: MakeupCloneOptions): StudyItem {
  const makeup = cloneJson(original);
  const templatePresetKey = effectiveTemplatePresetKey(original);

  makeup.id = options.id;
  makeup.presetKey = options.presetKey;
  if (templatePresetKey) makeup.templatePresetKey = templatePresetKey;
  makeup.source = 'preset';
  makeup.required = true;
  makeup.done = false;
  makeup.deferred = false;
  delete makeup.deferredTargetDay;
  makeup.deferredCarry = true;
  const originDates = uniqueStrings([
    original.deferredOriginDates,
    original.deferredOriginDate,
    options.originDate,
  ]);
  const originIds = uniqueStrings([
    original.deferredOriginIds,
    original.deferredOriginId,
    original.id,
  ]);
  makeup.deferredOriginDates = originDates;
  makeup.deferredOriginDate = originDates[0] || options.originDate;
  makeup.deferredOriginIds = originIds;
  makeup.deferredOriginId = originIds[0] || original.id || '';
  makeup.description = `延期自 ${originDates.join('、')}${originalDescription(original.description) ? `｜${originalDescription(original.description)}` : ''}`;
  if (Array.isArray(makeup.f?.groupedWorkEntries)) {
    makeup.f.groupedWorkEntries = makeup.f.groupedWorkEntries
      .filter(entry => entry && !entry.done)
      .map(entry => ({ ...entry, done: false }));
    makeup.done = false;
  }

  return makeup;
}

/** Keeps user-entered makeup progress while restoring any missing original template fields. */
export function mergeMakeupProgress(template: StudyItem, existing: StudyItem): StudyItem {
  const merged = cloneJson(template);
  merged.done = Boolean(existing.done);
  merged.minutes = existing.minutes || '';
  if (existing.checkedOn) merged.checkedOn = existing.checkedOn;
  else delete merged.checkedOn;
  if (existing.deferredCompletedOn) merged.deferredCompletedOn = existing.deferredCompletedOn;
  else delete merged.deferredCompletedOn;
  merged.f = {
    ...(cloneJson(template.f || {})),
    ...(cloneJson(existing.f || {})),
  };
  if (template.f?.deferredMergedRange === true) {
    merged.f.start = template.f.start;
    merged.f.end = template.f.end;
    merged.f.deferredMergedRange = true;
    for (const [key, value] of Object.entries(template.f)) {
      if (/^calendar/.test(key)) merged.f[key] = cloneJson(value);
    }
  }
  if (Array.isArray(template.f?.groupedWorkEntries)) {
    merged.f.groupedWorkEntries = mergeGroupedEntryProgress(
      template.f.groupedWorkEntries,
      Array.isArray(existing.f?.groupedWorkEntries) ? existing.f.groupedWorkEntries : [],
    );
    merged.f.deferredGroupedWork = template.f.deferredGroupedWork;
    merged.done = merged.f.groupedWorkEntries.length > 0
      && merged.f.groupedWorkEntries.every(entry => Boolean(entry.done));
  } else if (Array.isArray(existing.f?.groupedWorkEntries)) {
    merged.done = existing.f.groupedWorkEntries.length > 0
      && existing.f.groupedWorkEntries.every(entry => Boolean(entry.done));
    delete merged.f.groupedWorkEntries;
    delete merged.f.deferredGroupedWork;
  }
  restoreNaturalCalendarSchedule(merged, template);
  return merged;
}

function mergeDeferredRangeCluster(cluster: { items: StudyItem[]; range: { start: number; end: number } | null }): StudyItem {
  const base = cloneJson(cluster.items[0]);
  if (!cluster.range || cluster.items.length === 1) return base;

  const originDates = uniqueStrings(cluster.items.flatMap(item => [
    item.deferredOriginDates,
    item.deferredOriginDate,
  ]));
  const originIds = uniqueStrings(cluster.items.flatMap(item => [
    item.deferredOriginIds,
    item.deferredOriginId,
  ]));
  const descriptions = uniqueStrings(cluster.items.map(item => originalDescription(item.description)));

  base.f.start = String(cluster.range.start);
  base.f.end = String(cluster.range.end);
  base.f.deferredMergedRange = true;
  if (base.f.calendarSuggestedStart !== undefined) base.f.calendarSuggestedStart = cluster.range.start;
  if (base.f.calendarSuggestedEnd !== undefined) base.f.calendarSuggestedEnd = cluster.range.end;
  if (base.f.calendarDailyPages !== undefined) base.f.calendarDailyPages = cluster.range.end - cluster.range.start + 1;
  base.deferredOriginDates = originDates;
  base.deferredOriginDate = originDates[0] || base.deferredOriginDate;
  base.deferredOriginIds = originIds;
  base.deferredOriginId = originIds[0] || base.deferredOriginId;
  base.description = `延期自 ${originDates.join('、')}${descriptions.length ? `｜${descriptions.join('｜')}` : ''}`;
  return base;
}

function deferredGroupedChild(item: StudyItem, index: number): StudyItem {
  const child = cloneJson(item);
  child.id = `grouped-${item.presetKey || item.id}-${index}`;
  child.source = 'groupedWork';
  child.required = false;
  child.done = false;
  child.deferred = false;
  delete child.deferredTargetDay;
  return child;
}

/** Merges touching ranges and groups separated ranges/rounds as counted children. */
export function mergeDeferredCarryRanges(items: StudyItem[]): StudyItem[] {
  const clustered = contiguousRangeClusters(
    items,
    deferredRangeIdentity,
    item => item.deferredCarry ? numericPageRange(item.f) : null,
  ).map(mergeDeferredRangeCluster);

  const buckets = new Map<string, StudyItem[]>();
  const keyFor = (item: StudyItem): string => {
    if (numericPageRange(item.f)) return `range:${deferredRangeIdentity(item)}`;
    const round = deferredRoundIdentity(item);
    return round ? `round:${round}` : '';
  };
  clustered.forEach(item => {
    const key = keyFor(item);
    if (!key) return;
    const bucket = buckets.get(key) || [];
    bucket.push(item);
    buckets.set(key, bucket);
  });

  const emitted = new Set<string>();
  const output: StudyItem[] = [];
  for (const item of clustered) {
    const key = keyFor(item);
    const bucket = key ? buckets.get(key) || [] : [];
    if (!key || bucket.length < 2) {
      output.push(item);
      continue;
    }
    if (emitted.has(key)) continue;
    emitted.add(key);
    const parent = cloneJson(bucket[0]);
    const originDates = uniqueStrings(bucket.flatMap(entry => [entry.deferredOriginDates, entry.deferredOriginDate]));
    const originIds = uniqueStrings(bucket.flatMap(entry => [entry.deferredOriginIds, entry.deferredOriginId]));
    parent.f.groupedWorkEntries = bucket.map(deferredGroupedChild);
    parent.f.deferredGroupedWork = true;
    parent.done = false;
    parent.deferredOriginDates = originDates;
    parent.deferredOriginDate = originDates[0] || parent.deferredOriginDate;
    parent.deferredOriginIds = originIds;
    parent.deferredOriginId = originIds[0] || parent.deferredOriginId;
    parent.description = `延期自 ${originDates.join('、')}｜${bucket.length} 個子項目`;
    output.push(parent);
  }
  return output;
}
