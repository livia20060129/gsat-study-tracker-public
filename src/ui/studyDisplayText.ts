import { canonicalPageMappedBook } from '../data/bookPageMaps.ts';

export type StudyRangeKind = 'pages' | 'unit' | 'round';

function chapterNumber(value: string): string {
  if (/^\d+$/.test(value)) return String(Number(value));
  const digits = '零一二三四五六七八九';
  const parts = value.split('十');
  if (parts.length === 2) return String((parts[0] ? digits.indexOf(parts[0]) : 1) * 10 + (parts[1] ? digits.indexOf(parts[1]) : 0));
  return String(digits.indexOf(value));
}

function comparable(value: string): string {
  return value.normalize('NFKC').toLowerCase()
    .replace(/第\s*([零一二三四五六七八九十\d]+)\s*章\s*[:：]?/g, (_, number: string) => `chapter${chapterNumber(number)}`)
    .replace(/\bch(?:apter)?\.?\s*(\d+)\s*[:：]?/g, 'chapter$1')
    .replace(/[、；;：:]/g, '|')
    .replace(/[^\p{L}\p{N}|]/gu, '');
}

/** Token boundaries keep Unit 2 distinct from Unit 20, and Reading from Readings. */
export function studyTextIncludes(context: string, value: string): boolean {
  const text = comparable(context);
  const candidate = comparable(value);
  if (candidate.length < 2) return false;
  let offset = text.indexOf(candidate);
  while (offset >= 0) {
    const before = text[offset - 1] ?? '';
    const after = text[offset + candidate.length] ?? '';
    const first = candidate[0];
    let startOK = true;
    if (/\d/.test(first)) startOK = !/\d/.test(before);
    else if (/[a-z]/.test(first)) startOK = !/[a-z]/.test(before);
    else if (/\p{Script=Han}/u.test(first)) startOK = /^第\d+.*回$/.test(candidate) || !/\p{Script=Han}/u.test(before);
    const last = candidate.at(-1)!;
    let endOK = true;
    if (/\d/.test(last)) endOK = !/\d/.test(after);
    else if (/[a-z]/.test(last)) endOK = !/[a-z]/.test(after);
    else if (/\p{Script=Han}/u.test(last)) endOK = !/[\p{Script=Han}\d]/u.test(after);
    if (startOK && endOK) return true;
    offset = text.indexOf(candidate, offset + 1);
  }
  return false;
}

export function studyBookIncludes(context: string, book: string): boolean {
  const canonical = canonicalPageMappedBook(book);
  if (canonical && canonical === canonicalPageMappedBook(context)) return true;
  const identity = book.replace(/^(?:國文|英文|數學A?|自然|生物|物理|化學|地科)\s*[｜|：:]\s*/, '').replace(/講義$/, '');
  return studyTextIncludes(omitStudyRanges(context, ['pages', 'unit', 'round']), identity);
}

export function omitStudyRanges(text: string, kinds: readonly StudyRangeKind[]): string {
  let result = text;
  if (kinds.includes('pages')) result = result
    .replace(/\bp\.?\s*\d+(?:\s*[–—~～\-至到]\s*(?:p\.?\s*)?\d+)?/gi, '')
    .replace(/第?\s*\d+\s*(?:頁\s*)?(?:[–—~～\-至到]\s*(?:第\s*)?\d+\s*)?頁/g, '');
  if (kinds.includes('unit')) result = result.replace(/(?:\bunits?|單元)\s*[:：#]?\s*\d+(?:\s*[–—~～\-至到、,，]\s*(?:units?\s*)?\d+)*/gi, '');
  if (kinds.includes('round')) result = result
    .replace(/第\s*\d+(?:\s*回)?(?:\s*[–—~～\-至到]\s*(?:第\s*)?\d+)?\s*回/g, '')
    .replace(/(?:\b(?:rounds?|tests?)|回次)\s*[:：#]?\s*\d+(?:\s*[–—~～\-至到、,，]\s*\d+)*/gi, '');
  return result.replace(/[（(]\s*[)）]/g, '').split(/[｜|]/).map(part => part.trim()).filter(Boolean).join('｜');
}

/** Editable book selectors are the primary name display for manual cards. */
export function studyHeadingText(heading: string, selectedBooks: readonly string[], kinds: readonly StudyRangeKind[]): string {
  let result = omitStudyRanges(heading, kinds);
  for (const book of selectedBooks) {
    if (!studyBookIncludes(result, book)) continue;
    const variants = [book, book.normalize('NFKC'), book.replace(/講義$/, ''), book.replace(/\s*[（(].*?[)）]\s*$/, '')];
    for (const variant of variants) {
      const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp(escaped, 'gi'), '');
    }
    if (studyBookIncludes(result, book)) {
      result = result.split(/[｜|]/).filter(part => !studyBookIncludes(part, book)).join('｜');
    }
  }
  return result.replace(/^[｜|：:\s]+|[｜|：:\s]+$/g, '').replace(/\s*[｜|]\s*/g, '｜').trim();
}

/** Keep chapter names, but omit echoed names/scopes and page suffixes already shown by range fields. */
export function studyReferenceText(text: string, context: readonly string[], kinds: readonly StudyRangeKind[] = []): string {
  const known = [...context];
  const groups: string[] = [];
  const withoutPages = text.replace(/[（(]\s*p\.?\s*\d+(?:\s*[–—~～\-至到]\s*(?:p\.?\s*)?\d+)?\s*[)）]/gi, '');
  for (const group of withoutPages.split(/[、；;]/)) {
    const parts: string[] = [];
    for (const part of group.split(/[｜|]/)) {
      const value = omitStudyRanges(part, kinds).trim();
      if (!value || known.some(previous => studyTextIncludes(previous, value))) continue;
      parts.push(value);
      known.push(value);
    }
    if (parts.length) groups.push(parts.join('｜'));
  }
  return groups.join('、');
}
