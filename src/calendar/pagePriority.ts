export type CalendarPageRangeSource = 'calendar' | 'unit';

export interface CalendarPageRangeSelection {
  ranges: Array<[number, number]>;
  source: CalendarPageRangeSource | null;
}

function validRange(startValue: unknown, endValue: unknown): [number, number] | null {
  const start = Number(startValue);
  const end = Number(endValue ?? startValue);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  return [start, end];
}

/** Calendar's explicit pages always win; unit-derived ranges are fallback only. */
export function prioritizeCalendarPageRanges(
  explicitStart: unknown,
  explicitEnd: unknown,
  unitRanges: ReadonlyArray<readonly [unknown, unknown]> | null | undefined,
): CalendarPageRangeSelection {
  const explicit = validRange(explicitStart, explicitEnd);
  if (explicit) return { ranges: [explicit], source: 'calendar' };

  const ranges = (unitRanges ?? [])
    .map(range => validRange(range[0], range[1]))
    .filter((range): range is [number, number] => Boolean(range));
  return { ranges, source: ranges.length ? 'unit' : null };
}
