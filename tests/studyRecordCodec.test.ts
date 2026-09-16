import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_STUDY_RECORD_SCHEMA_VERSION,
  decodeStudyRecord,
  encodeStudyRecord,
} from '../src/storage/studyRecordCodec.ts';
import type { StudyRecord } from '../src/types.ts';

test('migrates an unversioned local record without discarding unknown fields', () => {
  const decoded = decodeStudyRecord(JSON.stringify({
    date: '2026-08-31',
    mood: '普通',
    customFutureField: { keep: true },
    items: [{
      id: 'legacy-item',
      type: 'future-template',
      done: false,
      minutes: '',
      required: true,
      f: { unknownField: '保留' },
    }],
  }), '2026-09-01');

  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.migrated, true);
  assert.equal(decoded.fromVersion, 0);
  assert.equal(decoded.record.schemaVersion, CURRENT_STUDY_RECORD_SCHEMA_VERSION);
  assert.equal(decoded.record.date, '2026-09-01');
  assert.deepEqual((decoded.record as unknown as Record<string, unknown>).customFutureField, { keep: true });
  assert.equal(decoded.record.items[0].f.unknownField, '保留');
});

test('encodes and decodes the current schema without changing study content', () => {
  const record: StudyRecord = {
    schemaVersion: CURRENT_STUDY_RECORD_SCHEMA_VERSION,
    date: '2026-09-01',
    mood: '良好',
    items: [{
      id: 'math-1',
      type: 'mathStudy',
      done: true,
      minutes: '45',
      required: true,
      f: { material: '教學講義', book: '1', start: '198', end: '205' },
    }],
  };

  const decoded = decodeStudyRecord(encodeStudyRecord(record));
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.migrated, false);
  assert.deepEqual(decoded.record, record);
});

test('rejects corrupt and unsupported payloads instead of overwriting them', () => {
  assert.deepEqual(decodeStudyRecord('{bad json'), { ok: false, error: 'invalid-json' });
  assert.deepEqual(
    decodeStudyRecord({ schemaVersion: 'one', date: '2026-09-01', items: [] }),
    { ok: false, error: 'invalid-schema-version' },
  );
  assert.deepEqual(
    decodeStudyRecord({ schemaVersion: CURRENT_STUDY_RECORD_SCHEMA_VERSION + 1, date: '2026-09-01', items: [] }),
    { ok: false, error: 'unsupported-schema-version' },
  );
});

test('normalizes a missing items array while preserving the record', () => {
  const decoded = decodeStudyRecord({ date: '2026-09-01', notes: '保留' });
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.deepEqual(decoded.record.items, []);
  assert.equal(decoded.record.notes, '保留');
});
