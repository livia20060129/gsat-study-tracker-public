import { unitBook } from './unitBooks.ts';
import { isEnglishPageMappedBook, pageMappedBookUsesScopeSelection } from './bookPageMaps.ts';
import { isListeningTestBookTitle } from './englishBooks.ts';
import { hasStudyPartAnnotation } from './studyPartAnnotation.ts';

export type NumberedScopeKind = 'unit' | 'round';

export interface NumberedScope {
  kind: NumberedScopeKind;
  start: string;
  end: string;
  maximum?: number;
}

interface ScopeItem {
  title?: string;
  description?: string;
  type?: string;
  f?: Record<string, unknown>;
}

export function numberedScopeMaximum(kind: NumberedScopeKind, title: unknown): number | undefined {
  const book = String(title ?? '');
  if (kind === 'unit') return unitBook(book)?.total;
  if (/大考英聽A攻略/.test(book)) return 10;
  if (/ACE Reading/i.test(book)) return 60;
  if (/英文寫作測驗/.test(book)) return 40;
  return undefined;
}

function ascii(value: unknown): string {
  return String(value ?? '').replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10));
}

/** Explicit scope markers only; dates, editions, pages and (1/2) parts are not scopes. */
export function numberedScopesInText(value: unknown): NumberedScope[] {
  const text = ascii(value);
  const pattern = /\b(Units?|Rounds?|Tests?)\s*[:：#]?\s*(\d+(?:\s*(?:[–—~～\-至到、,，]|及|和)\s*(?:(?:Units?|Rounds?|Tests?)\s*)?\d+)*)|(?:第\s*(\d+)\s*(?:回\s*)?(?:[–—~～\-至到]\s*(?:第\s*)?(\d+)\s*)?回)|(?:回次|單元)\s*[:：#]?\s*(\d+)(?:\s*[–—~～\-至到]\s*(\d+))?/gi;
  const result: NumberedScope[] = [];
  for (const match of text.matchAll(pattern)) {
    let kind: NumberedScopeKind;
    let ranges: string[];
    if (match[1]) {
      kind = /^unit/i.test(match[1]) ? 'unit' : 'round';
      ranges = match[2].replace(/\b(?:Units?|Rounds?|Tests?)\s*/gi, '').split(/[、,，]|及|和/);
    } else if (match[3]) {
      kind = 'round';
      ranges = [`${match[3]}-${match[4] ?? match[3]}`];
    } else {
      kind = /^單元/.test(match[0]) ? 'unit' : 'round';
      ranges = [`${match[5]}-${match[6] ?? match[5]}`];
    }
    for (const range of ranges) {
      const bounds = range.trim().match(/^(\d+)(?:\s*[–—~～\-至到]\s*(\d+))?$/);
      if (!bounds) continue;
      const start = Number(bounds[1]);
      const end = Number(bounds[2] ?? bounds[1]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start) {
        result.push({ kind, start: '', end: '' });
        continue;
      }
      result.push({ kind, start: String(start), end: String(end) });
    }
  }
  const unique = new Map<string, NumberedScope>();
  for (const scope of result) unique.set(`${scope.kind}:${scope.start}:${scope.end}`, scope);
  return [...unique.values()];
}

function scopeSources(item: ScopeItem): unknown[] {
  const fields = item.f ?? {};
  return [fields.calendarUnitProgress, fields.title, fields.book, item.title, item.description];
}

/** A split Unit/round must be recorded with actual pages, without discarding legacy Unit fields. */
export function usesSharedPageTemplate(item: ScopeItem): boolean {
  const fields = item.f ?? {};
  if (fields.scopeKind === 'pages') return true;
  if (!scopeSources(item).some(hasStudyPartAnnotation)) return false;
  return fields.scopeKind === 'unit' || fields.scopeKind === 'round'
    || [fields.unitStart, fields.unitEnd, fields.unit, fields.round, fields.roundEnd]
      .some(value => /^\d+$/.test(String(value ?? '')))
    || scopeSources(item).some(value => numberedScopesInText(value).length > 0)
    || unitBook(fields.title || fields.book || item.title) !== null;
}

/** Explicit split annotations take priority over Unit/round fields and book defaults. */
export function numberedStudyScope(item: ScopeItem): NumberedScope | null {
  if (usesSharedPageTemplate(item)) return null;
  const fields = item.f ?? {};
  const book = unitBook(fields.title || fields.book || item.title);
  let kind: NumberedScopeKind | undefined;
  if (fields.scopeKind === 'unit' || fields.scopeKind === 'round') kind = fields.scopeKind;
  else if ([fields.unitStart, fields.unitEnd, fields.unit].some(value => /^\d+$/.test(String(value ?? '')))) kind = 'unit';
  else if (/^\d+$/.test(String(fields.round ?? '')) || fields.roundEnd) kind = 'round';
  const inferred = scopeSources(item).flatMap(numberedScopesInText)[0];
  kind ??= inferred?.kind;
  if (!kind && book) kind = 'unit';
  if (!kind) return null;
  const startKey = kind === 'unit' ? 'unitStart' : 'round';
  const endKey = kind === 'unit' ? 'unitEnd' : 'roundEnd';
  const storedStart = fields[startKey] ?? (kind === 'unit' ? fields.unit : '');
  const storedEnd = fields[endKey];
  const overrides = fields.dailyWorkUserFields;
  const edited = overrides && typeof overrides === 'object'
    && [startKey, endKey].some(key => Object.prototype.hasOwnProperty.call(overrides, key));
  const hasFields = fields.scopeKind === kind || edited
    || [storedStart, storedEnd].some(value => /^\d+$/.test(String(value ?? '')))
    || (book && kind === 'unit' && (fields[startKey] !== undefined || fields[endKey] !== undefined));
  const fallback = inferred?.kind === kind ? inferred : null;
  const start = String(hasFields ? storedStart ?? '' : fallback?.start ?? '').trim();
  const end = String(hasFields ? fields[endKey] ?? start : fallback?.end ?? start).trim() || start;
  const maximum = numberedScopeMaximum(kind, fields.title || fields.book || item.title);
  return { kind, start, end, ...(maximum ? { maximum } : {}) };
}

/** A refreshed unsplit Calendar definition must not retain an earlier page-mode marker. */
export function resetObsoletePageScope(item: ScopeItem, template: ScopeItem): boolean {
  if (item.f?.scopeKind !== 'pages' || template.f?.scopeKind === 'pages' || !numberedStudyScope(template)) return false;
  delete item.f.scopeKind;
  item.f.calendarUnitProgress = template.f?.calendarUnitProgress ?? '';
  return true;
}

/** These templates already have their own round/Unit fields and additional book-specific controls. */
export function usesSharedNumberedTemplate(item: ScopeItem): boolean {
  const scope = numberedStudyScope(item);
  if (!scope) return false;
  const fields = item.f ?? {};
  const title = String(fields.title ?? '');
  if (fields.scopeKind === 'round') return true;
  if (scope.kind === 'unit') {
    return item.type !== 'magazine' && !['Essential Grammar in Use', '雜誌', '英文雜誌'].includes(title);
  }
  if (item.type === 'mock' || (item.type === 'chineseReading' && fields.kind === 'reading')) return false;
  const nativeRound = ['ACE Reading', '英文：ACE Reading', '英文寫作測驗'].includes(title)
    || isListeningTestBookTitle(title)
    || (isEnglishPageMappedBook(title) && pageMappedBookUsesScopeSelection(title));
  return !nativeRound;
}
