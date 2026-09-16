export interface NumericPageRange {
  start: number;
  end: number;
}

export interface RangeCluster<T> {
  items: T[];
  range: NumericPageRange | null;
}

export function numericPageRange(fields: Record<string, unknown> | null | undefined): NumericPageRange | null {
  const start = Number(fields?.start);
  const end = Number(fields?.end ?? fields?.start);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return null;
  return { start, end };
}

/** Groups only overlapping or directly adjacent page ranges with the same identity. */
export function contiguousRangeClusters<T>(
  items: T[],
  identity: (item: T) => string,
  rangeOf: (item: T) => NumericPageRange | null,
): RangeCluster<T>[] {
  const ranged = new Map<string, Array<{ item: T; range: NumericPageRange; index: number }>>();
  const clusters: Array<RangeCluster<T> & { index: number }> = [];

  items.forEach((item, index) => {
    const range = rangeOf(item);
    if (!range) {
      clusters.push({ items: [item], range: null, index });
      return;
    }
    const key = identity(item);
    const group = ranged.get(key) ?? [];
    group.push({ item, range, index });
    ranged.set(key, group);
  });

  for (const group of ranged.values()) {
    group.sort((left, right) => left.range.start - right.range.start
      || left.range.end - right.range.end
      || left.index - right.index);
    let active: { items: T[]; range: NumericPageRange; index: number } | null = null;
    for (const entry of group) {
      if (!active || entry.range.start > active.range.end + 1) {
        if (active) clusters.push(active);
        active = { items: [entry.item], range: { ...entry.range }, index: entry.index };
      } else {
        active.items.push(entry.item);
        active.range.end = Math.max(active.range.end, entry.range.end);
        active.index = Math.min(active.index, entry.index);
      }
    }
    if (active) clusters.push(active);
  }

  return clusters
    .sort((left, right) => left.index - right.index)
    .map(({ items: groupedItems, range }) => ({ items: groupedItems, range }));
}
