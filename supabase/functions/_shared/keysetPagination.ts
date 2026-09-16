export const EDGE_QUERY_PAGE_SIZE = 500;

/** Collects a complete result set and fails closed if a page cursor stalls. */
export async function collectStringKeysetPages<T>(
  fetchPage: (after: string | null, pageSize: number) => Promise<T[]>,
  cursorFromRow: (row: T) => string,
  pageSize = EDGE_QUERY_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;

  while (true) {
    const page = await fetchPage(cursor, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;

    const nextCursor = cursorFromRow(page[page.length - 1]).trim();
    if (!nextCursor) throw new Error('Paginated Supabase query returned an empty cursor.');
    if (nextCursor === cursor) throw new Error('Paginated Supabase query cursor did not advance.');
    cursor = nextCursor;
  }
}

export function chunksOf<T>(items: readonly T[], size = EDGE_QUERY_PAGE_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('Chunk size must be a positive integer.');
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
