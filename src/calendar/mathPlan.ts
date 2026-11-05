import type { CalendarMathPlanEntry } from '../types.ts';
import type { ParsedCalendarTask } from './calendarBridge.ts';
import { prioritizeCalendarPageRanges, type CalendarPageRangeSource } from './pagePriority.ts';

type MathTask = Extract<ParsedCalendarTask, { kind: 'math' }>;
type ScheduledMathPlan = CalendarMathPlanEntry & { material?: string };

export interface ResolvedMathCalendarPlan extends ScheduledMathPlan {
  calendarRangeSource: CalendarPageRangeSource;
  calendarMaterialSource?: 'calendar';
  calendarEventKey: string;
  calendarSourceEventId: string;
}

function bookKey(value: string): string {
  return value.normalize('NFKC').toUpperCase().replace(/數學|第|冊|\s/g, '').replace(/[＋+]/g, '+');
}

function topicParts(title: string): string[] {
  const separator = title.indexOf('｜');
  const topic = separator >= 0 ? title.slice(separator + 1) : title;
  return topic.normalize('NFKC')
    .replace(/\([^)]*\d\s*\/\s*\d[^)]*\)/g, '')
    .replace(/貝氏/g, '貝式').replace(/求和/g, '級數').replace(/數據整理/g, '數據分析')
    .replace(/函數/g, '').replace(/[\s:：｜|]/g, '').split(/[+＋]/).filter(Boolean);
}

function sameTopic(left: string, right: string): boolean {
  return topicParts(left).some(first => topicParts(right).some(second => (
    first === second || (first.length >= 2 && second.length >= 2 && (first.includes(second) || second.includes(first)))
  )));
}

function sourceDateKey(value: string | undefined, eventDate: string): string {
  const match = String(value ?? '').match(/^(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})$/);
  if (!match) return '';
  return `${match[1] || eventDate.slice(0, 4)}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

/** Find known unit ranges within the selected material and volume. */
function matchingPlans(task: MathTask, plans: Readonly<Record<string, ScheduledMathPlan>>): Array<[string, ScheduledMathPlan]> {
  const books = bookKey(task.book).split('+');
  const material = task.material || '教學講義';
  const eligible = Object.entries(plans).sort(([left], [right]) => left.localeCompare(right)).filter(([, plan]) => (
    (plan.material || '教學講義') === material
    && books.includes(bookKey(plan.book))
    && Number.isInteger(plan.start) && Number.isInteger(plan.end) && plan.start > 0 && plan.end >= plan.start
  ));
  const exact = eligible.filter(([, plan]) => plan.title === task.title);
  const matches = exact.length ? exact : eligible.filter(([, plan]) => sameTopic(plan.title, task.title));
  if (new Set(matches.map(([, plan]) => plan.title)).size > 1) return [];
  const unique = new Map<string, [string, ScheduledMathPlan]>();
  for (const entry of matches) {
    const plan = entry[1];
    const key = `${bookKey(plan.book)}:${plan.start}:${plan.end}`;
    if (!unique.has(key)) unique.set(key, entry);
  }
  return [...unique.values()];
}

/** Repartition a known complete unit into whole pages when its number of parts changes. */
function repartitionUnit(
  matches: ReadonlyArray<readonly [string, ScheduledMathPlan]>, index: number, total: number,
): ScheduledMathPlan | undefined {
  if (!matches.length || new Set(matches.map(([, plan]) => bookKey(plan.book))).size !== 1) return undefined;
  const ranges = matches.map(([, plan]) => plan).sort((left, right) => left.start - right.start);
  let end = ranges[0].end;
  for (const range of ranges.slice(1)) {
    if (range.start !== end + 1) return undefined;
    end = range.end;
  }
  const start = ranges[0].start;
  const pages = end - start + 1;
  if (total > pages) return undefined;
  const perPart = Math.floor(pages / total);
  const remainder = pages % total;
  const partStart = start + (index - 1) * perPart + Math.min(index - 1, remainder);
  const partPages = perPart + Number(index <= remainder);
  return { ...ranges[0], start: partStart, end: partStart + partPages - 1, pages: partPages, unitPages: pages };
}

export function resolveMathCalendarPlan(
  task: MathTask, plans: Readonly<Record<string, ScheduledMathPlan>>,
): ResolvedMathCalendarPlan | null {
  let matches = matchingPlans(task, plans);
  const explicit = prioritizeCalendarPageRanges(task.startPage, task.endPage, []);
  const hasFraction = task.progressIndex !== null || task.progressTotal !== null
    || /[0-9０-９]+\s*[／/]\s*[0-9０-９]+/.test(task.unitProgress || '')
    || /[（(]\s*[0-9０-９]+\s*[／/]\s*[0-9０-９]+\s*[）)]/.test(task.title);
  let base: ScheduledMathPlan | undefined;
  if (explicit.ranges.length) {
    base = matches.find(([, plan]) => plan.start === explicit.ranges[0][0] && plan.end === explicit.ranges[0][1])?.[1];
  } else if (hasFraction) {
    const index = task.progressIndex;
    const total = task.progressTotal;
    if (index === null || total === null || !Number.isInteger(index) || !Number.isInteger(total)
      || index < 1 || index > total) return null;
    if (total !== matches.length) {
      const combinedBook = bookKey(task.title.split('｜')[0]);
      const combined = combinedBook.includes('+') ? matchingPlans({ ...task, book: combinedBook }, plans) : [];
      if (combinedBook.includes('+')) {
        if (combined.length !== total || bookKey(combined[index - 1][1].book) !== bookKey(task.book)) return null;
        matches = combined;
      } else {
        base = repartitionUnit(matches, index, total);
        if (!base) return null;
      }
    }
    base ??= matches[index - 1]?.[1];
  } else {
    const sourceDate = sourceDateKey(task.sourceDate, task.date);
    base = matches.find(([date]) => date === sourceDate)?.[1]
      || matches.find(([date]) => date === task.date)?.[1] || matches[0]?.[1];
  }
  const selected = prioritizeCalendarPageRanges(task.startPage, task.endPage, base ? [[base.start, base.end]] : []);
  const range = selected.ranges[0];
  if (!range || !selected.source) return null;
  let book = task.book || base?.book || '';
  if (bookKey(book).includes('+') && base) book = base.book;
  const unitPages = matches.reduce((total, [, plan]) => total + plan.end - plan.start + 1, 0);
  return {
    ...(base || { unitPages: 0, weekTarget: 0 }),
    title: task.title,
    material: task.material || base?.material || '教學講義',
    book,
    start: range[0],
    end: range[1],
    pages: range[1] - range[0] + 1,
    unitPages,
    ...(task.standardNote && (task.material || task.book) ? { calendarMaterialSource: 'calendar' as const } : {}),
    calendarRangeSource: selected.source,
    calendarEventKey: task.eventKey,
    calendarSourceEventId: task.sourceEventId,
  };
}
