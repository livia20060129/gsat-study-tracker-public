import { calendarFixedTemplate, type CalendarFixedTemplate } from '../calendar/calendarBridge.ts';
import { contiguousRangeClusters, numericPageRange } from './rangeMerge.ts';

export interface PresetDefinitionLike {
  key: string;
  type: string;
  title: string;
  description: string;
  required: boolean;
  f: Record<string, unknown>;
}

const KEY_TEMPLATES: Record<string, CalendarFixedTemplate> = {
  weekday_math_study: 'mathStudy',
  fri_math_study: 'mathStudy',
  sat_math_fill: 'mathStudy',
  weekday_math_practice: 'mathPractice',
  fri_math_practice: 'mathPractice',
  sat_math_practice: 'mathPractice',
  sun_math_practice: 'mathPractice',
  daily_interactive: 'interactiveDaily',
  weekday_magazine: 'fixedMagazine',
  fri_magazine: 'fixedMagazine',
  weekday_english_review: 'englishReview',
  english_mixed_writing: 'englishMixedWriting',
  fri_mock_timed: 'englishMockTimed',
  sat_mock_correction: 'englishMockCorrection',
  sat_week_review: 'weekReview',
  sun_english_optional: 'englishLightReading',
};

export function presetDefinitionTemplate(definition: PresetDefinitionLike | null | undefined): CalendarFixedTemplate | null {
  if (!definition) return null;
  const declared = definition.f?.calendarFixedTemplate;
  if (typeof declared === 'string') return declared as CalendarFixedTemplate;
  return KEY_TEMPLATES[definition.key] || calendarFixedTemplate(definition.title);
}

function isCalendarDefinition(definition: PresetDefinitionLike): boolean {
  return /^cal_/.test(definition.key);
}

function normalizedText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

/** Identifies the scheduled work itself, excluding the Google event identity and user progress. */
export function presetDefinitionSemanticKey(definition: PresetDefinitionLike): string {
  const fields = definition.f || {};
  const semanticFields: Record<string, unknown> = {};
  const meaningfulKeys = [
    'title', 'book', 'topic', 'round', 'unit', 'unitStart', 'unitEnd', 'start', 'end', 'subject', 'kind',
    'calendarFixedTemplate', 'calendarOriginalTitle', 'calendarRoute', 'calendarMakeup',
    'calendarGrammarTitle', 'calendarUnitProgress', 'calendarRangeText', 'calendarRangeType', 'calendarTopic',
    'calendarFocus', 'calendarNaturalIntegration', 'calendarSourceDate',
    'calendarGroupedWork', 'calendarBookRangeLocked', 'calendarMathMaterialLocked', 'calendarScopeParseError',
    'calendarPreserveSeparate', 'groupedWorkEntries',
  ];
  for (const key of meaningfulKeys) {
    if (fields[key] !== undefined) semanticFields[key] = fields[key];
  }
  return JSON.stringify(stableValue({
    type: definition.type,
    title: normalizedText(definition.title),
    description: normalizedText(definition.description),
    fields: semanticFields,
  }));
}

function calendarMetadata(fields: Record<string, unknown>): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (/^calendar/.test(key)) metadata[key] = value;
  }
  if (fields.groupedWorkEntries !== undefined) metadata.groupedWorkEntries = fields.groupedWorkEntries;
  return metadata;
}

function rangeWorkIdentity(definition: PresetDefinitionLike): string {
  const fields = definition.f || {};
  return JSON.stringify(stableValue({
    type: definition.type,
    title: normalizedText(definition.title),
    template: presetDefinitionTemplate(definition),
    material: normalizedText(fields.material),
    book: normalizedText(fields.book),
    itemTitle: normalizedText(fields.title),
    topic: normalizedText(fields.topic),
    subject: normalizedText(fields.subject),
    kind: normalizedText(fields.kind),
    grammarTitle: normalizedText(fields.calendarGrammarTitle),
  }));
}

function calendarRangeIdentity(definition: PresetDefinitionLike): string {
  return JSON.stringify({
    work: rangeWorkIdentity(definition),
    route: normalizedText(definition.f?.calendarRoute),
  });
}

function uniqueText(values: unknown[]): string[] {
  return [...new Set(values.flatMap(value => Array.isArray(value) ? value : [value])
    .map(normalizedText)
    .filter(Boolean))];
}

function calendarEventMetadata(items: PresetDefinitionLike[]): Record<string, unknown> {
  const fields = items.map(item => item.f || {});
  const eventIds = uniqueText(fields.flatMap(item => [item.calendarEventIds, item.calendarEventId]));
  const eventKeys = uniqueText(fields.flatMap(item => [item.calendarEventKeys, item.calendarEventKey]));
  const sourceDates = uniqueText(fields.flatMap(item => [item.calendarSourceDates, item.calendarSourceDate]));
  return {
    ...(eventIds.length ? { calendarEventId: eventIds[0], calendarEventIds: eventIds } : {}),
    ...(eventKeys.length ? { calendarEventKey: eventKeys[0], calendarEventKeys: eventKeys } : {}),
    ...(sourceDates.length ? { calendarSourceDate: sourceDates[0], calendarSourceDates: sourceDates } : {}),
  };
}

function groupedChild(definition: PresetDefinitionLike, index: number): Record<string, unknown> {
  return {
    id: `grouped-${definition.key}-${index}`,
    type: definition.type,
    done: false,
    minutes: '',
    required: definition.required,
    source: 'groupedWork',
    presetKey: definition.key,
    templatePresetKey: definition.key,
    title: definition.title,
    description: definition.description,
    f: { ...(definition.f || {}) },
    calendarGroupedChild: true,
  };
}

function calendarRoundIdentity(definition: PresetDefinitionLike): string {
  const fields = definition.f || {};
  const category = /^cal_(ace|book|listening_a|gujin|writing)_/.exec(definition.key)?.[1] || '';
  if (!category || !normalizedText(fields.round)) return '';
  return JSON.stringify({
    category,
    type: definition.type,
    title: normalizedText(fields.title),
    book: normalizedText(fields.book),
    topic: normalizedText(fields.topic),
    kind: normalizedText(fields.kind),
    route: normalizedText(fields.calendarRoute),
  });
}

function groupedParentTitle(definition: PresetDefinitionLike, mode: 'range' | 'round'): string {
  if (mode === 'range') return definition.title;
  if (/^cal_ace_/.test(definition.key)) return '英文｜ACE Reading';
  if (/^cal_listening_a_/.test(definition.key)) return '英文｜大考英聽A攻略';
  if (/^cal_gujin_/.test(definition.key)) return '國文｜古今悅讀一百';
  if (/^cal_writing_/.test(definition.key)) return '英文｜英文寫作測驗';
  if (/^cal_book_/.test(definition.key)) return definition.title;
  return definition.title;
}

function mergeCalendarRangeDefinitions<T extends PresetDefinitionLike>(definitions: T[]): T[] {
  const clusters = contiguousRangeClusters(
    definitions,
    calendarRangeIdentity,
    definition => isCalendarDefinition(definition) ? numericPageRange(definition.f) : null,
  );

  return clusters.map(cluster => {
    const base = { ...cluster.items[0], f: { ...(cluster.items[0].f || {}) } } as T;
    if (!cluster.range || cluster.items.length === 1) return base;

    const descriptions = uniqueText(cluster.items.map(item => item.description));

    base.required = cluster.items.some(item => item.required);
    base.description = descriptions.join('｜');
    base.f.start = String(cluster.range.start);
    base.f.end = String(cluster.range.end);
    base.f.calendarMergedRange = true;
    base.f.calendarDailyPages = cluster.range.end - cluster.range.start + 1;
    base.f.calendarSuggestedStart = cluster.range.start;
    base.f.calendarSuggestedEnd = cluster.range.end;
    if (base.f.calendarRangeText !== undefined) {
      base.f.calendarRangeText = `p.${cluster.range.start}–${cluster.range.end}`;
    }
    Object.assign(base.f, calendarEventMetadata(cluster.items));
    return base;
  });
}

/** Groups separated ranges and repeated rounds under one card while keeping each child countable. */
function groupCalendarWorkDefinitions<T extends PresetDefinitionLike>(definitions: T[]): T[] {
  const merged = mergeCalendarRangeDefinitions(definitions);
  const groups = new Map<string, Array<{ item: T; index: number; mode: 'range' | 'round' }>>();
  const passthrough = new Set<number>();

  merged.forEach((item, index) => {
    if (!isCalendarDefinition(item)) {
      passthrough.add(index);
      return;
    }
    const range = numericPageRange(item.f);
    const roundIdentity = calendarRoundIdentity(item);
    const mode = range ? 'range' : 'round';
    const identity = range ? `range:${calendarRangeIdentity(item)}` : (roundIdentity ? `round:${roundIdentity}` : '');
    if (!identity) {
      passthrough.add(index);
      return;
    }
    const group = groups.get(identity) || [];
    group.push({ item, index, mode });
    groups.set(identity, group);
  });

  const groupedAt = new Map<number, T>();
  const consumed = new Set<number>();
  for (const group of groups.values()) {
    const unique: typeof group = [];
    const uniqueKeys = new Map<string, number>();
    for (const entry of group) {
      const range = numericPageRange(entry.item.f);
      const workKey = entry.mode === 'range'
        ? `${range?.start || ''}-${range?.end || ''}`
        : `${normalizedText(entry.item.f?.topic)}｜${normalizedText(entry.item.f?.round)}`;
      const found = uniqueKeys.get(workKey);
      if (found === undefined) {
        uniqueKeys.set(workKey, unique.length);
        unique.push(entry);
      } else {
        const retained = unique[found].item;
        retained.required = retained.required || entry.item.required;
        Object.assign(retained.f, calendarEventMetadata([retained, entry.item]));
        retained.f.calendarMakeup = retained.f.calendarMakeup === true && entry.item.f?.calendarMakeup === true;
      }
      consumed.add(entry.index);
    }
    if (unique.length < 2) {
      groupedAt.set(group[0].index, unique[0].item);
      continue;
    }
    const first = unique[0];
    const parent = {
      ...first.item,
      required: unique.some(entry => entry.item.required),
      title: groupedParentTitle(first.item, first.mode),
      description: uniqueText(unique.map(entry => entry.item.description)).join('｜'),
      f: {
        ...(first.item.f || {}),
        ...calendarEventMetadata(unique.map(entry => entry.item)),
        calendarGroupedWork: true,
        calendarMakeup: unique.every(entry => entry.item.f?.calendarMakeup === true),
        ...(unique.some(entry => entry.item.f?.calendarMakeup === true) ? { calendarIncludesMakeup: true } : {}),
        groupedWorkEntries: unique.map((entry, index) => groupedChild(entry.item, index)),
      },
    } as T;
    groupedAt.set(first.index, parent);
  }

  const output: T[] = [];
  merged.forEach((item, index) => {
    const grouped = groupedAt.get(index);
    if (grouped) output.push(grouped);
    else if (passthrough.has(index) || !consumed.has(index)) output.push(item);
  });
  return output;
}

function templateRangeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const keys = ['material', 'book', 'unit', 'chapter', 'title', 'subject', 'kind', 'start', 'end'];
  for (const key of keys) if (fields[key] !== undefined) output[key] = fields[key];
  return output;
}

/** Merges one matching Calendar definition into the built-in card and leaves intentional extra events separate. */
export function dedupePresetDefinitions<T extends PresetDefinitionLike>(definitions: T[]): T[] {
  const output: T[] = [];
  const builtInIndex = new Map<CalendarFixedTemplate, number>();
  const consumedBuiltIn = new Set<CalendarFixedTemplate>();
  const seenCalendarWork = new Set<string>();

  for (const original of groupCalendarWorkDefinitions(definitions)) {
    const definition = {
      ...original,
      f: { ...(original.f || {}) },
    } as T;
    const template = presetDefinitionTemplate(definition);

    if (!isCalendarDefinition(definition)) {
      const index = output.push(definition) - 1;
      if (template && !builtInIndex.has(template)) builtInIndex.set(template, index);
      continue;
    }

    const semanticKey = presetDefinitionSemanticKey(definition);
    definition.f.calendarSemanticKey = semanticKey;
    if (seenCalendarWork.has(semanticKey)) continue;
    seenCalendarWork.add(semanticKey);

    const route = definition.f?.calendarRoute;
    const preserveSeparate = definition.f?.calendarPreserveSeparate === true;
    const index = template && route !== 'week' && !preserveSeparate ? builtInIndex.get(template) : undefined;
    if (!template || index === undefined || consumedBuiltIn.has(template)) {
      output.push(definition);
      continue;
    }

    const base = output[index];
    const definitionRange = numericPageRange(definition.f);
    const baseRange = numericPageRange(base.f);
    if (definitionRange && baseRange) {
      const sameWork = rangeWorkIdentity(base) === rangeWorkIdentity(definition);
      const contiguous = definitionRange.start <= baseRange.end + 1 && baseRange.start <= definitionRange.end + 1;
      if (!sameWork || !contiguous) {
        output.push(definition);
        continue;
      }
    }
    const metadata = calendarMetadata(definition.f || {});
    const includesMakeup = metadata.calendarMakeup === true || metadata.calendarIncludesMakeup === true;
    delete metadata.calendarMakeup;
    output[index] = {
      ...base,
      description: `${base.description}${definition.title ? `｜Google Calendar：${definition.title}` : ''}`,
      f: {
        ...(base.f || {}),
        ...(definitionRange ? templateRangeFields(definition.f || {}) : {}),
        ...metadata,
        ...(definitionRange && baseRange ? {
          start: String(Math.min(definitionRange.start, baseRange.start)),
          end: String(Math.max(definitionRange.end, baseRange.end)),
        } : {}),
        calendarMerged: true,
        ...(includesMakeup ? { calendarIncludesMakeup: true } : {}),
      },
    };
    consumedBuiltIn.add(template);
  }

  return output;
}
