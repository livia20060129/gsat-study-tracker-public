import { isExcludedEnglishTodoTitle, OVERDUE_TASK_SUBJECTS, type OverdueItemSubject, type OverdueTaskSubject } from './overdueTasks.ts';

interface FilterableEntry {
  subject: OverdueItemSubject;
  subjectLabel: string;
  title: string;
}

export interface OverdueItemOption {
  value: string;
  label: string;
}

const SUBJECT_PREFIXES: Record<OverdueItemSubject, RegExp> = {
  chinese: /^(?:國文|中文)\s*[｜|:：]\s*/,
  english: /^(?:英文|英語)\s*[｜|:：]\s*/,
  math: /^數學(?:[ABＡＢ甲乙])?\s*[｜|:：]\s*/i,
  natural: /^自然\s*[｜|:：]\s*/,
  other: /^其他\s*[｜|:：]\s*/,
};

const SCOPE_MARKERS = [
  /\b(?:Units?|Rounds?|Tests?|Ch(?:apters?)?\.?|Lessons?|Ranks?)\s*[:：#]?\s*[0-9０-９]+/i,
  /第\s*[0-9０-９一二三四五六七八九十百零〇兩]+\s*(?:[–—~～\-至到]\s*(?:第\s*)?[0-9０-９一二三四五六七八九十百零〇兩]+\s*)?(?:回|章|單元|課)/,
  /(?:回次|單元|章節)\s*[:：#]?\s*[0-9０-９一二三四五六七八九十百零〇兩]+/,
  /\bp(?:ages?)?\.\s*[0-9０-９]+/i,
];

/** Remove display prefixes and scope suffixes only; the original cards stay separate. */
export function overdueItemTitle(subject: OverdueItemSubject, title: string): string {
  let name = title.replace(/\s+/g, ' ').trim();
  const prefix = SUBJECT_PREFIXES[subject];
  while (prefix.test(name)) name = name.replace(prefix, '').trim();
  let scopeStart = name.length;
  for (const marker of SCOPE_MARKERS) {
    const index = name.search(marker);
    if (index >= 0) scopeStart = Math.min(scopeStart, index);
  }
  if (scopeStart > 0 && scopeStart < name.length) {
    const book = name.slice(0, scopeStart).replace(/[\s｜|:：\-–—/／]+$/g, '');
    if (book) name = book;
  }
  return name || '未命名項目';
}

export function overdueItemKey(entry: FilterableEntry): string {
  return `${entry.subject}:${overdueItemTitle(entry.subject, entry.title)}`;
}

export function normalizedOverdueItemFilter(value: unknown): string {
  if (typeof value !== 'string') return '';
  const separator = value.indexOf(':');
  const subject = value.slice(0, separator);
  const title = value.slice(separator + 1).trim();
  if (!OVERDUE_TASK_SUBJECTS.some(candidate => candidate !== 'all' && candidate === subject) || !title) return '';
  if (isExcludedEnglishTodoTitle(title, subject as OverdueItemSubject)) return '';
  return `${subject}:${overdueItemTitle(subject as OverdueItemSubject, title)}`;
}

export function overdueItemFilterForSubject(selected: string, subject: OverdueTaskSubject): string {
  const key = normalizedOverdueItemFilter(selected);
  if (subject === 'all' || key.startsWith(`${subject}:`)) return key;
  return '';
}

/** Group a book's rounds, Units and chapters across dates, keeping subjects separate. */
export function overdueItemOptions(entries: readonly FilterableEntry[]): OverdueItemOption[] {
  const distinct = new Map<string, FilterableEntry>();
  for (const entry of entries) distinct.set(overdueItemKey(entry), entry);
  const sorted = [...distinct.entries()].sort(function compareEntries([leftKey, left], [rightKey, right]): number {
    const subjectOrder = OVERDUE_TASK_SUBJECTS.indexOf(left.subject) - OVERDUE_TASK_SUBJECTS.indexOf(right.subject);
    return subjectOrder || leftKey.localeCompare(rightKey, 'zh-TW', { numeric: true });
  });
  return sorted.map(([value, entry]) => ({ value, label: `${entry.subjectLabel}｜${overdueItemTitle(entry.subject, entry.title)}` }));
}

export function overdueEntriesForItem<T extends FilterableEntry>(entries: readonly T[], selected: string): T[] {
  const key = normalizedOverdueItemFilter(selected);
  if (!key) return [...entries];
  return entries.filter(entry => overdueItemKey(entry) === key);
}
