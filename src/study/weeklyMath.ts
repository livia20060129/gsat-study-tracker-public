import type { PageRange } from '../types';

export function countUniquePages(ranges: PageRange[]): number {
  const pages = new Set<number>();
  for (const range of ranges) {
    const start = Math.min(range.start, range.end);
    const end = Math.max(range.start, range.end);
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  return pages.size;
}

export function pageCount(start: number, end: number): number {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.abs(end - start) + 1;
}
