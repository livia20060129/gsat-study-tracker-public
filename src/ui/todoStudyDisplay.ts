import type { OverdueTaskDetail, OverdueTaskEntry } from '../study/overdueTasks.ts';
import { studyCardDescription } from './studyDescription.ts';
import { omitStudyRanges, studyBookIncludes, studyHeadingText, studyReferenceText, studyTextIncludes, type StudyRangeKind } from './studyDisplayText.ts';

interface TodoStudyDisplay {
  title: string;
  description: string;
  details: OverdueTaskDetail[];
  rangeSummary: string;
}

/** Read-only scope for collapsed cards, derived from the same fields as the editors. */
export function todoRangeSummary(details: readonly OverdueTaskDetail[]): string {
  const start = details.find(detail => detail.editableRange === 'start');
  const end = details.find(detail => detail.editableRange === 'end');
  const first = start?.value.trim() ?? '';
  const last = end?.value.trim() ?? '';
  const range = first && last && first !== last ? `${first}–${last}` : first || last;
  const parts: string[] = [];
  const book = details.find(detail => ['書名／冊別', '冊別', '冊數'].includes(detail.label));
  if (book && /^\d+(?:\s*[–—~～\-至]\s*\d+)*$/.test(book.value.trim())) parts.push(`第 ${book.value.trim()} 冊`);
  if (range) {
    const kind = start?.rangeKind ?? end?.rangeKind;
    if (kind === 'unit') parts.push(`Unit ${range}`);
    else if (kind === 'round') parts.push(`第 ${range} 回`);
    else parts.push(`p.${range}`);
  } else {
    for (const detail of details) {
      if (['頁碼', '回次', '單元', '指定範圍'].includes(detail.label) && detail.value.trim()) {
        parts.push(`${detail.label} ${detail.value.trim()}`);
      }
    }
  }
  return [...new Set(parts)].join('｜');
}

/** Presentation only: the entry and its data attributes still identify the original saved task. */
export function todoStudyDisplay(entry: Pick<OverdueTaskEntry, 'title' | 'description' | 'details'>): TodoStudyDisplay {
  const kinds: StudyRangeKind[] = entry.details.filter(detail => detail.editableRange).map(detail => detail.rangeKind ?? 'pages');
  const title = studyHeadingText(entry.title, [], kinds) || '讀書項目';
  const context = [title];
  const details: OverdueTaskDetail[] = [];
  for (const detail of entry.details) {
    if (detail.editableRange) {
      details.push(detail);
      continue;
    }
    const identity = ['書名', '書名／冊別', '教材', '講義', '講義版本', '科目'].includes(detail.label);
    if (identity && context.some(previous => studyBookIncludes(previous, detail.value))) continue;
    const scope = ['單元', '章節', '主題', '回次', 'Google Calendar 當日主題'].includes(detail.label);
    if (scope && context.some(previous => studyTextIncludes(previous, detail.value))) continue;
    details.push(detail);
    if (identity || scope) context.push(detail.value);
  }
  const description = studyCardDescription(entry.description).split(/[｜|]/).filter(part => {
    if (!omitStudyRanges(part, kinds).trim()) return false;
    return !context.some(previous => studyBookIncludes(previous, part.trim()));
  }).join('｜');
  return { title, details, description: studyReferenceText(description, context), rangeSummary: todoRangeSummary(entry.details) };
}
