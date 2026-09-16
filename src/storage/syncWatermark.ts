export const RECORD_SYNC_WATERMARK_PREFIX = 'study-v11:meta:records-watermark:';
export const DEFAULT_SYNC_OVERLAP_MS = 2 * 60 * 1000;

export interface TimestampedRow {
  updated_at?: unknown;
}

export function recordSyncWatermarkKey(userId: string): string {
  return `${RECORD_SYNC_WATERMARK_PREFIX}${userId}`;
}

export function validServerTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

/**
 * Re-read a small overlap so equal timestamps and a write racing the previous
 * response cannot create a gap. Revision comparison keeps the overlap safe and
 * idempotent.
 */
export function incrementalSyncStart(
  watermark: unknown,
  overlapMs = DEFAULT_SYNC_OVERLAP_MS,
): string | null {
  const normalized = validServerTimestamp(watermark);
  if (!normalized) return null;
  return new Date(Date.parse(normalized) - Math.max(0, overlapMs)).toISOString();
}

export function latestServerWatermark(
  rows: TimestampedRow[],
  current?: unknown,
): string | null {
  let latest = validServerTimestamp(current);
  let latestTime = latest ? Date.parse(latest) : Number.NEGATIVE_INFINITY;

  for (const row of rows) {
    const candidate = validServerTimestamp(row?.updated_at);
    if (!candidate) continue;
    const candidateTime = Date.parse(candidate);
    if (candidateTime > latestTime) {
      latest = candidate;
      latestTime = candidateTime;
    }
  }

  return latest;
}
