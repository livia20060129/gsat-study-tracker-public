import type { StudyRecord } from '../types';

export type RecordSyncDecision =
  | 'use-local'
  | 'use-cloud'
  | 'equal'
  | 'legacy-conflict';

function timestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    if (key === 'updatedAt') continue;
    output[key] = canonicalize(input[key]);
  }
  return output;
}

export function sameStudyPayload(a: StudyRecord | null | undefined, b: StudyRecord | null | undefined): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/**
 * Pure conflict resolution. A legacy local record with no timestamp is never
 * silently replaced when its content differs from the cloud record.
 */
export function resolveRecordSync(
  local: StudyRecord | null,
  cloud: StudyRecord | null,
  cloudUpdatedAt?: string | null,
): RecordSyncDecision {
  if (!local && cloud) return 'use-cloud';
  if (local && !cloud) return 'use-local';
  if (!local && !cloud) return 'equal';
  if (sameStudyPayload(local, cloud)) return 'equal';

  const localTime = timestamp(local?.updatedAt);
  const cloudTime = timestamp(cloudUpdatedAt) ?? timestamp(cloud?.updatedAt);

  if (localTime === null) return 'legacy-conflict';
  if (cloudTime === null) return 'use-local';
  if (localTime > cloudTime) return 'use-local';
  if (cloudTime > localTime) return 'use-cloud';

  // Equal timestamps with different payloads cannot be ordered safely.
  return 'legacy-conflict';
}
