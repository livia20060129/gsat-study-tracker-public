import type { StudyItem } from '../types.ts';

function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [value];
}

type ParsedDate = { key: string; label: string; time: number };

function parseDate(value: string, defaultYear: number): ParsedDate | null {
  const match = value.match(/^(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1] || defaultYear);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return {
    key: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    label: `${month}/${day}`,
    time,
  };
}

function compressDates(rawDates: string[], fallbackDate: string): string {
  const yearMatch = fallbackDate.match(/^(\d{4})[-/]/)
    || rawDates.map(value => value.match(/^(\d{4})[-/]/)).find(Boolean);
  const defaultYear = Number(yearMatch?.[1] || 2000);
  const parsed = new Map<string, ParsedDate>();
  const unparsed = new Set<string>();
  for (const raw of rawDates) {
    const date = parseDate(raw, defaultYear);
    if (date) parsed.set(date.key, date);
    else if (raw) unparsed.add(raw);
  }

  const ordered = [...parsed.values()].sort((a, b) => a.time - b.time);
  const segments: string[] = [];
  for (let index = 0; index < ordered.length;) {
    let end = index;
    while (end + 1 < ordered.length && ordered[end + 1].time - ordered[end].time === 86_400_000) end += 1;
    segments.push(end === index ? ordered[index].label : `${ordered[index].label}-${ordered[end].label}`);
    index = end + 1;
  }
  return [...segments, ...unparsed].join('、') || '—';
}

function normalizedDateKey(value: unknown, currentDate: string): string {
  const raw = String(value ?? '').trim();
  const year = Number(currentDate.match(/^(\d{4})[-/]/)?.[1] || 2000);
  return parseDate(raw, year)?.key || raw;
}

function sourceDates(item: StudyItem): string[] {
  const dates = new Set<string>();
  const visited = new Set<StudyItem>();
  const add = (value: unknown): void => {
    for (const candidate of values(value)) {
      const raw = String(candidate ?? '').trim();
      if (raw) dates.add(raw);
    }
  };
  const visit = (candidate: StudyItem): void => {
    if (!candidate || visited.has(candidate)) return;
    visited.add(candidate);
    add(candidate.deferredOriginDates);
    add(candidate.deferredOriginDate);
    add(candidate.f?.calendarSourceDates);
    add(candidate.f?.calendarSourceDate);
    const sources = candidate.f?.dailyWorkSourceItems;
    if (Array.isArray(sources)) sources.forEach(visit);
    const children = candidate.f?.groupedWorkEntries;
    if (Array.isArray(children)) children.forEach(visit);
  };
  visit(item);
  return [...dates];
}

/** Collects the original dates represented by a Calendar/deferred aggregate. */
export function groupedSourceDateText(item: StudyItem, fallbackDate = ''): string {
  const dates = sourceDates(item);
  if (!dates.length && fallbackDate) dates.push(fallbackDate);
  return compressDates(dates, fallbackDate);
}

/** True when a child includes Tracker deferral or Calendar makeup work. */
export function hasDeferredStudySource(item: StudyItem): boolean {
  const visited = new Set<StudyItem>();
  const visit = (candidate: StudyItem): boolean => {
    if (!candidate || visited.has(candidate)) return false;
    visited.add(candidate);
    if (candidate.deferredCarry || candidate.deferred === true || candidate.f?.calendarMakeup === true
      || candidate.f?.dailyWorkIncludesDeferred === true) return true;
    const sources = candidate.f?.dailyWorkSourceItems;
    if (Array.isArray(sources) && sources.some(visit)) return true;
    const children = candidate.f?.groupedWorkEntries;
    return Array.isArray(children) && children.some(visit);
  };
  return visit(item);
}

/** Shows source dates only for deferred/makeup work or when the source is not the displayed day. */
export function shouldShowSourceDate(item: StudyItem, currentDate: string): boolean {
  if (hasDeferredStudySource(item)) return true;
  const currentKey = normalizedDateKey(currentDate, currentDate);
  if (!currentKey) return false;
  return sourceDates(item).some(date => normalizedDateKey(date, currentDate) !== currentKey);
}
