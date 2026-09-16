import type { StudyRecord } from '../types.ts';

export const CURRENT_STUDY_RECORD_SCHEMA_VERSION = 1;

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

function migrateLegacyRecord(source: JsonObject): JsonObject {
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
  let parsed: unknown = input;
  if (typeof input === 'string') {
    try {
      parsed = JSON.parse(input);
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

  let migrated = cloneObject(parsed);
  if (fromVersion === 0) migrated = migrateLegacyRecord(migrated);

  const date = validDate(authoritativeDate)
    ? authoritativeDate
    : validDate(migrated.date)
      ? migrated.date
      : null;
  if (!date) return { ok: false, error: 'invalid-record' };

  migrated.date = date;
  migrated.schemaVersion = CURRENT_STUDY_RECORD_SCHEMA_VERSION;
  migrated.items = Array.isArray(migrated.items) ? migrated.items : [];
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
