import { numberedStudyScope, type NumberedScope } from '../data/numberedScopes.ts';
import type { StudyItem } from '../types.ts';
import { propagateDailyWorkField } from './dailyWorkGroup.ts';

export function validNumberedScope(scope: NumberedScope, start: string, end: string): boolean {
  if (!start && !end) return true;
  const effectiveEnd = end || start;
  return /^\d+$/.test(start) && /^\d+$/.test(effectiveEnd)
    && Number.isSafeInteger(Number(start)) && Number.isSafeInteger(Number(effectiveEnd))
    && Number(start) >= 1 && Number(effectiveEnd) >= Number(start)
    && (!scope.maximum || Number(effectiveEnd) <= scope.maximum);
}

/** Numbered scopes never overwrite actual page fields, flags, timers or completion dates. */
export function applyNumberedScope(item: StudyItem, start: string, end: string): void {
  const scope = numberedStudyScope(item);
  if (!scope) return;
  const startKey = scope.kind === 'unit' ? 'unitStart' : 'round';
  const endKey = scope.kind === 'unit' ? 'unitEnd' : 'roundEnd';
  const values = {
    scopeKind: scope.kind,
    [startKey]: start ? String(Number(start)) : '',
    [endKey]: end ? String(Number(end)) : (start ? String(Number(start)) : ''),
  };
  for (const [key, value] of Object.entries(values)) propagateDailyWorkField(item, key, value);
  const overrides = item.f.dailyWorkUserFields;
  propagateDailyWorkField(item, 'dailyWorkUserFields', {
    ...(overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {}), ...values,
  });
}

export function numberedScopeText(item: StudyItem): string {
  const scope = numberedStudyScope(item);
  if (!scope) return '';
  if (!scope.start) return scope.kind === 'unit' ? '尚未填寫 Unit。' : '尚未填寫回次。';
  const range = scope.end === scope.start ? scope.start : `${scope.start}–${scope.end}`;
  return scope.kind === 'unit' ? `Unit ${range}` : `第 ${range} 回`;
}
