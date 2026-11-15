import type { StudyItem } from '../types.ts';
import { numberedStudyScope } from '../data/numberedScopes.ts';
import { numberedScopeText } from '../study/numberedScopeProgress.ts';
import { omitStudyRanges, studyBookIncludes, type StudyRangeKind } from './studyDisplayText.ts';

/** Read current fields for the weekly view without rewriting the saved title or progress. */
export function weeklyStudyDisplay(item: StudyItem, fallbackTitle = '讀書項目'): { title: string; range: string } {
  const fields = item.f ?? {};
  const scope = numberedStudyScope(item);
  let range = scope ? numberedScopeText(item) : '';
  const kinds: StudyRangeKind[] = scope ? [scope.kind] : [];
  if (!scope) {
    const start = String(fields.start ?? '').trim();
    const end = String(fields.end ?? start).trim() || start;
    if (/^[1-9]\d*$/.test(start) && /^[1-9]\d*$/.test(end) && Number(end) >= Number(start)) {
      range = start === end ? `p.${start}` : `p.${start}–${end}`;
      kinds.push('pages');
    }
  }
  const book = item.type === 'extra' ? String(fields.title || fields.book || '').trim() : '';
  const heading = omitStudyRanges(item.title || fallbackTitle, kinds) || book || fallbackTitle;
  const title = book && !studyBookIncludes(heading, book) ? `${heading}｜${book}` : heading;
  return { title, range };
}
