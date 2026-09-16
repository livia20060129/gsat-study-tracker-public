import type { StudyRecord, StudyRecordSyncConflict } from '../types';
import { ensureEnglishReviewWordEntryIds } from '../study/englishReview.ts';

export interface CloudStudyRecordRow {
  study_date: string;
  payload: StudyRecord | Record<string, unknown>;
  revision: number;
  updated_at: string;
}

export type RevisionSyncDecision = 'use-cloud' | 'push-local' | 'equal' | 'conflict';

export interface StudyRecordMergeResult {
  record: StudyRecord;
  conflicts: StudyRecordSyncConflict[];
  usedThreeWayMerge: boolean;
}

const SYNC_META_KEYS = new Set([
  'updatedAt', 'serverRevision', 'serverUpdatedAt', 'localDirty', 'syncConflict',
  'syncBase', 'syncConflictDetails', 'syncConflictLocal', 'syncConflictCloud',
  'storageIssue',
]);

const ABSENT = Symbol('absent');
type MergeValue = unknown | typeof ABSENT;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(input).sort()) {
    if (SYNC_META_KEYS.has(key)) continue;
    output[key] = canonicalize(input[key]);
  }
  return output;
}

function cloneValue<T>(value: T): T {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

function isObject(value: MergeValue): value is Record<string, unknown> {
  return value !== ABSENT && Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sameValue(left: MergeValue, right: MergeValue): boolean {
  if (left === ABSENT || right === ABSENT) return left === right;
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function isBlankValue(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && value.trim() === '');
}

function arrayEntryKey(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  for (const key of ['id', 'deferredOriginId', 'calendarEventId', 'eventId', 'presetKey', 'key']) {
    const candidate = String(entry[key] ?? '').trim();
    if (candidate) return `${key}:${candidate}`;
  }
  const semanticParts = ['type', 'title', 'subject', 'material', 'source', 'name', 'unit', 'word']
    .map((key) => String(entry[key] ?? '').trim());
  return semanticParts.some(Boolean) ? `semantic:${semanticParts.join('|')}` : null;
}

function stableValueKey(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? String(value);
}

function migratedWordId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const id = String((value as Record<string, unknown>).id ?? '');
  return id.startsWith('word:v2:') ? id : '';
}

function alignEditedLegacyWords(primary: unknown[], secondary: unknown[]): unknown[] {
  const adjusted = secondary.map(cloneValue);
  if (primary.length !== adjusted.length) return adjusted;
  const primaryIds = new Set(primary.map(migratedWordId).filter(Boolean));
  const secondaryIds = new Set(adjusted.map(migratedWordId).filter(Boolean));
  if (primaryIds.size !== primary.length || secondaryIds.size !== adjusted.length) return adjusted;
  for (let index = 0; index < adjusted.length; index += 1) {
    const primaryId = migratedWordId(primary[index]);
    const secondaryId = migratedWordId(adjusted[index]);
    if (!primaryId || !secondaryId || primaryId === secondaryId) continue;
    // IDs based on unchanged content already match even after reordering. If
    // neither ID exists on the other side, this is the same legacy row being
    // edited in two queued snapshots; retain the newer primary row identity.
    if (!secondaryIds.has(primaryId) && !primaryIds.has(secondaryId)) {
      (adjusted[index] as Record<string, unknown>).id = primaryId;
    }
  }
  return adjusted;
}

function mergeArraysLegacy(primary: unknown[], secondary: unknown[]): unknown[] {
  const merged = primary.map(cloneValue);
  const alignedSecondary = alignEditedLegacyWords(primary, secondary);
  const keyedIndexes = new Map<string, number>();
  const valueIndexes = new Map<string, number>();
  merged.forEach((entry, index) => {
    const key = arrayEntryKey(entry);
    if (key) keyedIndexes.set(key, index);
    else valueIndexes.set(stableValueKey(entry), index);
  });
  for (const entry of alignedSecondary) {
    const key = arrayEntryKey(entry);
    const existingIndex = key ? keyedIndexes.get(key) : valueIndexes.get(stableValueKey(entry));
    if (existingIndex !== undefined) {
      merged[existingIndex] = mergeRecordedValueLegacy(merged[existingIndex], entry);
      continue;
    }
    const nextIndex = merged.push(cloneValue(entry)) - 1;
    if (key) keyedIndexes.set(key, nextIndex);
    else valueIndexes.set(stableValueKey(entry), nextIndex);
  }
  return merged;
}

/** Compatibility path for records saved before a common sync base existed. */
function mergeRecordedValueLegacy(primary: unknown, secondary: unknown): unknown {
  if (isBlankValue(primary)) return cloneValue(secondary);
  if (isBlankValue(secondary)) return cloneValue(primary);
  if (Array.isArray(primary) && Array.isArray(secondary)) return mergeArraysLegacy(primary, secondary);
  if (isObject(primary) && isObject(secondary)) {
    const output: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(secondary), ...Object.keys(primary)])) {
      output[key] = mergeRecordedValueLegacy(primary[key], secondary[key]);
    }
    return output;
  }
  return cloneValue(primary);
}

function serializableConflictValue(value: MergeValue): { exists: boolean; value?: unknown } {
  return value === ABSENT ? { exists: false } : { exists: true, value: cloneValue(value) };
}

function addConflict(
  conflicts: StudyRecordSyncConflict[], path: string, kind: StudyRecordSyncConflict['kind'],
  base: MergeValue, local: MergeValue, cloud: MergeValue,
): void {
  const baseValue = serializableConflictValue(base);
  const localValue = serializableConflictValue(local);
  const cloudValue = serializableConflictValue(cloud);
  conflicts.push({
    path, kind,
    baseExists: baseValue.exists,
    localExists: localValue.exists,
    cloudExists: cloudValue.exists,
    ...(baseValue.exists ? { base: baseValue.value } : {}),
    ...(localValue.exists ? { local: localValue.value } : {}),
    ...(cloudValue.exists ? { cloud: cloudValue.value } : {}),
  });
}

function keyedArray(values: unknown[]): Map<string, unknown> | null {
  const result = new Map<string, unknown>();
  for (const value of values) {
    const key = arrayEntryKey(value);
    if (!key || result.has(key)) return null;
    result.set(key, value);
  }
  return result;
}

function mergeKeyedArrays(
  base: unknown[], local: unknown[], cloud: unknown[], path: string,
  conflicts: StudyRecordSyncConflict[],
): unknown[] | null {
  const baseMap = keyedArray(base);
  const localMap = keyedArray(local);
  const cloudMap = keyedArray(cloud);
  if (!baseMap || !localMap || !cloudMap) return null;
  const order: string[] = [];
  const seen = new Set<string>();
  for (const values of [local, cloud, base]) {
    for (const value of values) {
      const key = arrayEntryKey(value) as string;
      if (!seen.has(key)) { seen.add(key); order.push(key); }
    }
  }
  const merged: unknown[] = [];
  for (const key of order) {
    const value = mergeThreeWayValue(
      baseMap.has(key) ? baseMap.get(key) : ABSENT,
      localMap.has(key) ? localMap.get(key) : ABSENT,
      cloudMap.has(key) ? cloudMap.get(key) : ABSENT,
      `${path}[${key}]`, conflicts,
    );
    if (value !== ABSENT) merged.push(value);
  }
  return merged;
}

function mergeThreeWayValue(
  base: MergeValue, local: MergeValue, cloud: MergeValue, path: string,
  conflicts: StudyRecordSyncConflict[],
): MergeValue {
  if (sameValue(local, cloud)) return local === ABSENT ? ABSENT : cloneValue(local);
  if (sameValue(local, base)) return cloud === ABSENT ? ABSENT : cloneValue(cloud);
  if (sameValue(cloud, base)) return local === ABSENT ? ABSENT : cloneValue(local);

  if (Array.isArray(base) && Array.isArray(local) && Array.isArray(cloud)) {
    const keyed = mergeKeyedArrays(base, local, cloud, path, conflicts);
    if (keyed) return keyed;
    addConflict(conflicts, path, 'unkeyed-array', base, local, cloud);
    return cloneValue(local);
  }

  if (isObject(local) && isObject(cloud) && (isObject(base) || base === ABSENT)) {
    const baseObject = isObject(base) ? base : {};
    const output: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(baseObject), ...Object.keys(local), ...Object.keys(cloud)]);
    for (const key of keys) {
      const value = mergeThreeWayValue(
        Object.prototype.hasOwnProperty.call(baseObject, key) ? baseObject[key] : ABSENT,
        Object.prototype.hasOwnProperty.call(local, key) ? local[key] : ABSENT,
        Object.prototype.hasOwnProperty.call(cloud, key) ? cloud[key] : ABSENT,
        path === '$' ? `$.${key}` : `${path}.${key}`, conflicts,
      );
      if (value !== ABSENT) output[key] = value;
    }
    return output;
  }

  addConflict(conflicts, path, local === ABSENT || cloud === ABSENT ? 'delete-vs-edit' : 'same-field', base, local, cloud);
  return local === ABSENT ? ABSENT : cloneValue(local);
}

function normalizedRecord(record: StudyRecord): StudyRecord {
  const normalized = cloneValue(record);
  ensureEnglishReviewWordEntryIds(normalized);
  normalized.items = Array.isArray(normalized.items) ? normalized.items : [];
  return normalized;
}

function storedSyncBase(record: StudyRecord | null | undefined): StudyRecord | null {
  const candidate = record?.syncBase;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return normalizedRecord(candidate);
}

/** Payload sent to Supabase; device-local sync metadata is excluded. */
export function stripRecordSyncMeta(record: StudyRecord): StudyRecord {
  const copy = cloneValue(record);
  for (const key of SYNC_META_KEYS) delete (copy as unknown as Record<string, unknown>)[key];
  copy.items = Array.isArray(copy.items) ? copy.items : [];
  return copy;
}

/** Marks a server result as the common ancestor for later three-way merges. */
export function markRecordSynced(record: StudyRecord): StudyRecord {
  const synced = normalizedRecord(record);
  synced.syncBase = stripRecordSyncMeta(synced);
  synced.localDirty = false;
  synced.syncConflict = false;
  delete synced.syncConflictDetails;
  delete synced.syncConflictLocal;
  delete synced.syncConflictCloud;
  return synced;
}

export function mergeStudyRecordsThreeWay(
  local: StudyRecord, cloud: StudyRecord, explicitBase?: StudyRecord | null,
): StudyRecordMergeResult {
  if (local.date !== cloud.date) throw new Error('Cannot merge study records from different dates.');
  const normalizedLocal = normalizedRecord(local);
  const normalizedCloud = normalizedRecord(cloud);
  let base = explicitBase ? normalizedRecord(explicitBase) : storedSyncBase(normalizedLocal);
  if (!base) base = storedSyncBase(normalizedCloud);
  if (
    !base
    && local.localDirty
    && Number(local.serverRevision || 0) > 0
    && Number(local.serverRevision || 0) === Number(cloud.serverRevision || 0)
    && !cloud.localDirty
  ) {
    base = normalizedRecord(stripRecordSyncMeta(normalizedCloud));
  }
  if (!base) {
    const record = mergeRecordedValueLegacy(normalizedLocal, normalizedCloud) as StudyRecord;
    record.date = local.date;
    record.schemaVersion = Math.max(Number(local.schemaVersion || 0), Number(cloud.schemaVersion || 0));
    record.items = Array.isArray(record.items) ? record.items : [];
    return { record, conflicts: [], usedThreeWayMerge: false };
  }
  if (base.date !== local.date) throw new Error('Cannot merge study records from different dates.');
  const conflicts: StudyRecordSyncConflict[] = [];
  const mergedValue = mergeThreeWayValue(
    stripRecordSyncMeta(base), stripRecordSyncMeta(normalizedLocal), stripRecordSyncMeta(normalizedCloud), '$', conflicts,
  );
  const record = (mergedValue === ABSENT ? stripRecordSyncMeta(normalizedLocal) : mergedValue) as StudyRecord;
  record.date = local.date;
  record.schemaVersion = Math.max(Number(local.schemaVersion || 0), Number(cloud.schemaVersion || 0));
  record.items = Array.isArray(record.items) ? record.items : [];
  record.syncBase = stripRecordSyncMeta(base);
  if (conflicts.length) {
    record.syncConflictDetails = conflicts;
    record.syncConflictLocal = stripRecordSyncMeta(normalizedLocal);
    record.syncConflictCloud = stripRecordSyncMeta(normalizedCloud);
  }
  return { record, conflicts, usedThreeWayMerge: true };
}

export function mergeStudyRecordsForUpload(
  pending: StudyRecord, existing: StudyRecord | null | undefined,
): StudyRecord {
  const normalizedPending = normalizedRecord(pending);
  if (!existing) return normalizedPending;
  return mergeStudyRecordsThreeWay(normalizedPending, existing).record;
}

export function recordSyncConflicts(record: StudyRecord | null | undefined): StudyRecordSyncConflict[] {
  return Array.isArray(record?.syncConflictDetails) ? cloneValue(record.syncConflictDetails) : [];
}

export function sameStudyContent(a: StudyRecord | null | undefined, b: StudyRecord | null | undefined): boolean {
  if (!a || !b) return a === b;
  return JSON.stringify(canonicalize(a)) === JSON.stringify(canonicalize(b));
}

/** Pure revision decision; the save path performs the field-level merge. */
export function decideRevisionSync(local: StudyRecord | null, cloud: StudyRecord | null): RevisionSyncDecision {
  if (!local && cloud) return 'use-cloud';
  if (local && !cloud) return 'push-local';
  if (!local && !cloud) return 'equal';
  if (sameStudyContent(local, cloud)) return 'equal';
  if (!local || !cloud) return 'conflict';
  const localRevision = Number(local.serverRevision ?? 0);
  const cloudRevision = Number(cloud.serverRevision ?? 0);
  if (local.syncConflict) return 'conflict';
  if (local.localDirty) {
    if (localRevision === cloudRevision) return 'push-local';
    return storedSyncBase(local) ? 'push-local' : 'conflict';
  }
  if (localRevision > 0 && cloudRevision > localRevision) return 'use-cloud';
  return 'conflict';
}
