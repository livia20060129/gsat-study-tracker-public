import { numberedStudyScope } from '../data/numberedScopes.ts';
import type { StudyItem } from '../types.ts';

/** A deliberate uncheck must survive later coverage refreshes, including after navigation. */
export function markRangeCompletionByUser(item: StudyItem, checked: boolean): void {
  const fields = item.f;
  if (!fields || ['mathPractice', 'interactive', 'englishPractice', 'mock', 'general'].includes(item.type)) return;
  if (!fields.rangeCompletion && !numberedStudyScope(item) && !(Number(fields.start) > 0 && Number(fields.end) >= Number(fields.start))) return;
  if (checked) delete fields.rangeCompletionOptOut;
  else fields.rangeCompletionOptOut = true;
  delete fields.rangeCompletion;
}
