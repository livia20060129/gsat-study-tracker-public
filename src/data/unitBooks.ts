import { BOOK_PAGE_MAPS, canonicalPageMappedBook, UNLOCK_3_BOOK } from './bookPageMaps.ts';

export interface UnitBook {
  title: string;
  total: number;
}

export function unitBook(value: unknown): UnitBook | null {
  if (/Essential\s+Grammar\s+in\s+Use/i.test(String(value ?? ''))) {
    return { title: 'Essential Grammar in Use', total: 115 };
  }
  if (canonicalPageMappedBook(value) === UNLOCK_3_BOOK) return { title: UNLOCK_3_BOOK, total: 8 };
  return null;
}

/** Reads explicit Unit numbers only: book editions, dates and (1/2) parts are not units. */
export function bookUnitNumbers(value: unknown, total: number): number[] {
  const text = String(value ?? '').replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - 0xff10));
  const numbers = new Set<number>();
  const pattern = /(?:\bUnits?|單元)\s*[:：#]?\s*(\d+(?:\s*(?:[–—~\-至到、,，]|及|和)\s*(?:Units?\s*)?\d+)*)/gi;
  for (const match of text.matchAll(pattern)) {
    for (const range of match[1].split(/[、,，]|及|和/)) {
      const bounds = range.replace(/\bUnits?\s*/gi, '').trim().match(/^(\d+)(?:\s*[–—~\-至到]\s*(\d+))?$/i);
      if (!bounds) continue;
      const start = Number(bounds[1]);
      const end = Number(bounds[2] ?? bounds[1]);
      if (start < 1 || end < start || end > total) continue;
      for (let unit = start; unit <= end; unit++) numbers.add(unit);
    }
  }
  return [...numbers].sort((left, right) => left - right);
}

export function unitBookSections(value: unknown): Array<{ unit: number; title: string; start: number; end: number }> {
  if (unitBook(value)?.title !== UNLOCK_3_BOOK) return [];
  return BOOK_PAGE_MAPS[UNLOCK_3_BOOK].flatMap(function unitSection(section) {
    const match = section.topic.match(/^Unit (\d+)$/);
    return match ? [{ unit: Number(match[1]), title: section.detail, start: section.start, end: section.end }] : [];
  });
}
