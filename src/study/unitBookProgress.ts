import { unitBook, unitBookSections } from '../data/unitBooks.ts';
import type { StudyItem } from '../types.ts';
import { numberedStudyScope } from '../data/numberedScopes.ts';
import { applyNumberedScope, validNumberedScope } from './numberedScopeProgress.ts';

export interface BookUnitRange {
  start: string;
  end: string;
}

export function bookUnitRange(item: StudyItem): BookUnitRange {
  const fields = item.f ?? {};
  const book = unitBook(fields.title || fields.book || item.title);
  const scope = numberedStudyScope(item);
  if (scope?.kind !== 'unit') return { start: '', end: '' };
  const start = String(fields.unitStart ?? fields.unit ?? '').trim();
  const end = String(fields.unitEnd ?? start).trim();
  if (Object.prototype.hasOwnProperty.call(fields, 'unitStart')
    || Object.prototype.hasOwnProperty.call(fields, 'unitEnd') || start || end) return { start, end: end || start };
  if (scope.start) return { start: scope.start, end: scope.end };
  const sections = unitBookSections(book?.title).filter(section => (
    Number(fields.start) > 0 && Number(fields.start) <= section.end
    && Number(fields.end || fields.start) >= section.start
  ));
  if (sections.length) return { start: String(sections[0].unit), end: String(sections.at(-1)!.unit) };
  return { start: '', end: '' };
}

export function bookUnitText(item: StudyItem): string {
  const range = bookUnitRange(item);
  if (!range.start) return '尚未填寫 Unit。';
  const label = range.start === range.end ? `Unit ${range.start}` : `Unit ${range.start}–${range.end}`;
  const topics = unitBookSections(item.f.title || item.f.book).filter(section => (
    section.unit >= Number(range.start) && section.unit <= Number(range.end)
  )).map(section => section.title);
  return [label, ...topics].join('｜');
}

export function validBookUnitRange(item: StudyItem, start: string, end: string): boolean {
  const scope = numberedStudyScope(item);
  return scope?.kind === 'unit' && validNumberedScope(scope, start, end);
}

/** Keep original page fields intact; Unit edits are stored on their own fields and source rows. */
export function applyBookUnitRange(item: StudyItem, start: string, end: string): void {
  if (numberedStudyScope(item)?.kind === 'unit') applyNumberedScope(item, start, end);
}
