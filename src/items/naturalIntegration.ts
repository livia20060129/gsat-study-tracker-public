import type { CalendarNaturalIntegrationEntry } from '../types';

export function rangeText(ranges: Array<[number, number]> = []): string {
  if (!ranges.length) return '—';
  return ranges
    .map(([start, end]) => start === end ? `p.${start}` : `p.${start}–${end}`)
    .join('、');
}

export function normalizeNaturalIntegrationEntry(
  entry: CalendarNaturalIntegrationEntry
): CalendarNaturalIntegrationEntry {
  return {
    ...entry,
    material: '123日的淬鍊',
    done: Boolean(entry.done),
    ranges: entry.ranges ?? [],
  };
}
