import type { StudyRecord } from '../types.ts';
import { sameStudyContent, stripRecordSyncMeta } from './recordSync.ts';

export const CURRENT_STUDY_RECORD_SCHEMA_VERSION = 2;

export type StudyRecordDecodeError =
  | 'invalid-json'
  | 'invalid-record'
  | 'invalid-schema-version'
  | 'unsupported-schema-version';

export type StudyRecordDecodeResult =
  | {
      ok: true;
      record: StudyRecord;
      migrated: boolean;
      fromVersion: number;
    }
  | {
      ok: false;
      error: StudyRecordDecodeError;
    };

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cloneObject(value: JsonObject): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}

function migrateRecord(source: JsonObject): JsonObject {
  return {
    ...source,
    schemaVersion: CURRENT_STUDY_RECORD_SCHEMA_VERSION,
    items: Array.isArray(source.items) ? source.items : [],
  };
}

function schemaVersion(source: JsonObject): number | null {
  if (source.schemaVersion === undefined) return 0;
  const version = Number(source.schemaVersion);
  return Number.isInteger(version) && version >= 0 ? version : null;
}

/**
 * Decodes localStorage or Supabase JSON without discarding unknown legacy fields.
 * The key/row date is authoritative when supplied, preventing a payload from
 * being loaded into a different day accidentally.
 */
export function decodeStudyRecord(
  input: unknown,
  authoritativeDate?: string,
): StudyRecordDecodeResult {
  const parsedFromString = typeof input === 'string';
  let parsed: unknown = input;
  if (parsedFromString) {
    try {
      parsed = JSON.parse(input as string);
    } catch {
      return { ok: false, error: 'invalid-json' };
    }
  }
  if (!isObject(parsed)) return { ok: false, error: 'invalid-record' };

  const fromVersion = schemaVersion(parsed);
  if (fromVersion === null) return { ok: false, error: 'invalid-schema-version' };
  if (fromVersion > CURRENT_STUDY_RECORD_SCHEMA_VERSION) {
    return { ok: false, error: 'unsupported-schema-version' };
  }

  // JSON.parse already owns its result; object inputs still need an independent copy.
  let migrated = parsedFromString ? parsed : cloneObject(parsed);
  if (fromVersion < CURRENT_STUDY_RECORD_SCHEMA_VERSION) migrated = migrateRecord(migrated);

  const date = validDate(authoritativeDate)
    ? authoritativeDate
    : validDate(migrated.date)
      ? migrated.date
      : null;
  if (!date) return { ok: false, error: 'invalid-record' };

  migrated.date = date;
  migrated.schemaVersion = CURRENT_STUDY_RECORD_SCHEMA_VERSION;
  migrated.items = Array.isArray(migrated.items) ? migrated.items : [];
  if (migrated.__localSyncBase !== undefined) {
    if (migrated.__localSyncBase !== 'same-content-v1' || !(Number(migrated.serverRevision) > 0)) {
      return { ok: false, error: 'invalid-record' };
    }
    delete migrated.__localSyncBase;
    if (migrated.localDirty === false && !migrated.syncConflict) {
      migrated.syncBase = stripRecordSyncMeta(migrated as unknown as StudyRecord);
    }
  }
  return {
    ok: true,
    record: migrated as unknown as StudyRecord,
    migrated: fromVersion !== CURRENT_STUDY_RECORD_SCHEMA_VERSION,
    fromVersion,
  };
}

/** Serializes the current payload shape for both localStorage and Supabase. */
export function encodeStudyRecord(record: StudyRecord): string {
  return JSON.stringify({
    ...record,
    schemaVersion: CURRENT_STUDY_RECORD_SCHEMA_VERSION,
    items: Array.isArray(record.items) ? record.items : [],
  });
}

/** A confirmed, unchanged baseline can be reconstructed without storing the entire day twice. */
export function encodeLocalStudyRecord(record: StudyRecord): string {
  if (record.localDirty !== false || record.syncConflict || !(Number(record.serverRevision) > 0)
    || !record.syncBase || !sameStudyContent(record, record.syncBase)) return encodeStudyRecord(record);
  const stored: JsonObject = { ...record, schemaVersion: CURRENT_STUDY_RECORD_SCHEMA_VERSION };
  delete stored.syncBase;
  stored.__localSyncBase = 'same-content-v1';
  return JSON.stringify(stored);
}
