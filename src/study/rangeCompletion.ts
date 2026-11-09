import { canonicalPageMappedBook } from '../data/bookPageMaps.ts';
import { numberedStudyScope } from '../data/numberedScopes.ts';
import type { StudyItem, StudyRecord } from '../types.ts';
import { completionChildItems, refreshCompletionTree } from './completionTree.ts';
import { relinkDailyWorkSourceItems } from './dailyWorkGroup.ts';
import { studyItemSubject } from './subjectOrder.ts';

export { markRangeCompletionByUser } from './rangeCompletionChoice.ts';

interface CompletedRange { start: number; end: number; date: string }
interface ItemRange { key: string; start: number; end: number }
interface AutomaticCompletion { date: string; range: ItemRange }

function text(value: unknown): string {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, '').toLowerCase();
}

function interval(start: unknown, end: unknown): { start: number; end: number } | null {
  const low = Number(start), high = Number(end || start);
  if (!Number.isSafeInteger(low) || !Number.isSafeInteger(high) || low < 1 || high < low) return null;
  return { start: low, end: high };
}

/** Matching uses a material identity, never the card title's dates or chapter subtitle. */
function itemRange(item: StudyItem): ItemRange | null {
  const f = item.f ?? {};
  if (['mathPractice', 'interactive', 'englishPractice', 'mock'].includes(item.type)) return null;
  const subject = studyItemSubject(item);
  if (item.type === 'general' && !['國文', '英文', '數學', '自然', '公民', '歷史', '地理'].includes(subject)) return null;
  const science = subject === '自然' ? text(f.subject) : '';
  if (subject === '自然' && !/^(生物|物理|化學|地科)$/.test(science)) return null;
  const math = subject === '數學';
  const rawTitle = f.title || (math ? '' : f.book);
  let material = text(f.material || rawTitle);
  if (!material && item.type === 'chineseReading' && f.kind === 'reading') material = '古今悅讀一百';
  const canonical = canonicalPageMappedBook(rawTitle);
  if (canonical && !math && !f.material) material = text(canonical);
  const snapshot = f.catalogMaterialSnapshot as { match?: { material?: string; book?: string }; title?: string } | undefined;
  if (!material) material = text(snapshot?.match?.material || snapshot?.title);
  if (!material) return null;
  const volume = math ? text(f.book || snapshot?.match?.book).replace(/第|冊/g, '') : '';
  if (math && !volume && !f.catalogMaterialId) return null;
  const scope = numberedStudyScope(item);
  const range = scope ? interval(scope.start, scope.end) : interval(f.start, f.end);
  if (!range) return null;
  const customId = String(f.catalogMaterialId ?? '').startsWith('custom:') ? f.catalogMaterialId : '';
  const identity = [subject, science, material, volume, scope?.kind ?? 'pages', customId];
  return { key: JSON.stringify(identity), ...range };
}

function leaves(items: StudyItem[]): StudyItem[] {
  const output: StudyItem[] = [], visited = new Set<StudyItem>();
  function visit(item: StudyItem): void {
    if (!item || visited.has(item)) return;
    visited.add(item);
    const children = completionChildItems(item, true);
    if (children.length) children.forEach(visit);
    else output.push(item);
  }
  items.forEach(visit);
  return output;
}

function coverageDate(ranges: CompletedRange[], target: ItemRange): string | null {
  const dates = [...new Set(ranges.map(range => range.date))].sort();
  function coveredBy(cutoff: string): boolean {
    let cursor = target.start;
    for (const range of ranges) {
      if (range.date > cutoff || range.end < cursor) continue;
      if (range.start > cursor) return false;
      cursor = Math.max(cursor, range.end + 1);
      if (cursor > target.end) return true;
    }
    return false;
  }
  if (!dates.length || !coveredBy(dates.at(-1)!)) return null;
  // Find the earliest actual date with full coverage. A later, larger reread must not move completion forward.
  let low = 0, high = dates.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (coveredBy(dates[middle])) high = middle;
    else low = middle + 1;
  }
  return dates[low];
}

/** Automatic marks cannot become evidence for more automatic marks. */
export function completedRangeIndex(records: readonly StudyRecord[]): Map<string, CompletedRange[]> {
  const index = new Map<string, CompletedRange[]>();
  for (const record of records) {
    if (record.syncConflict || record.storageIssue) continue;
    for (const item of leaves(record.items)) {
      if (!item.f || !item.done || item.f.rangeCompletion || item.deferred === true
        || (item.f.calendarAutoCompletedDone === true && item.f.calendarCompletionUserValue !== true)) continue;
      const range = itemRange(item);
      if (!range) continue;
      const date = item.checkedOn || item.deferredCompletedOn || record.date;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const entries = index.get(range.key) ?? [];
      entries.push({ start: range.start, end: range.end, date });
      index.set(range.key, entries);
    }
  }
  for (const ranges of index.values()) ranges.sort((a, b) => a.start - b.start || a.date.localeCompare(b.date));
  return index;
}

function desiredCompletion(item: StudyItem, index: ReturnType<typeof completedRangeIndex>): AutomaticCompletion | null | undefined {
  if (!item.f || item.f.calendarScheduleArchived === true) return undefined;
  const previous = item.f.rangeCompletion as AutomaticCompletion | undefined;
  if (item.f.rangeCompletionOptOut === true || (!previous && item.done)) return undefined;
  if (item.f.calendarCompletionSetByUser === true && item.f.calendarCompletionUserValue === false) return undefined;
  if (!previous && !item.required && item.source !== 'preset') return undefined;
  if (item.deferred || item.deferredCarry || item.f.overdueSkippedOn) return undefined;
  const range = itemRange(item);
  const date = range && coverageDate(index.get(range.key) ?? [], range);
  if (date && range) {
    const marker: AutomaticCompletion = { date, range };
    if (item.done && JSON.stringify(previous) === JSON.stringify(marker)) return undefined;
    return marker;
  }
  return previous ? null : undefined;
}

export function reconcileRangeCompletion(
  record: StudyRecord, index: ReturnType<typeof completedRangeIndex>,
): StudyRecord | null {
  if (!leaves(record.items).some(item => desiredCompletion(item, index) !== undefined)) return null;
  const copy = JSON.parse(JSON.stringify(record)) as StudyRecord;
  relinkDailyWorkSourceItems(copy.items);
  for (const item of leaves(copy.items)) {
    const desired = desiredCompletion(item, index);
    if (desired === undefined) continue;
    if (desired) {
      item.done = true;
      item.checkedOn = desired.date;
      item.f.rangeCompletion = desired;
    } else {
      item.done = false;
      delete item.checkedOn;
      delete item.f.rangeCompletion;
    }
  }
  copy.items.forEach(item => refreshCompletionTree(item));
  return copy;
}

/** Excludes note/timer/metadata writes so they do not trigger a full coverage reconciliation. */
export function rangeCompletionSignature(record: StudyRecord | null): string {
  if (!record) return '';
  return JSON.stringify(leaves(record.items).map(item => [item.id, itemRange(item), item.done,
    item.checkedOn, item.deferredCompletedOn, item.required, item.source, item.deferred,
    item.f?.overdueSkippedOn, item.f?.rangeCompletion, item.f?.rangeCompletionOptOut]));
}
