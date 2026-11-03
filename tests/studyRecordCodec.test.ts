import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CURRENT_STUDY_RECORD_SCHEMA_VERSION,
  decodeStudyRecord,
  encodeStudyRecord,
} from '../src/storage/studyRecordCodec.ts';
import type { StudyRecord } from '../src/types.ts';

test('string and object decoding agree while returned content and sync baselines remain independent', () => {
  const source: StudyRecord = { schemaVersion: 2, date: '2026-11-03', items: [{
    id: 'word', type: 'englishVocabInteractive', done: false, minutes: '15', required: false,
    f: { words: [{ id: 'ability', text: 'ability', noun: true }] },
  }] };
  source.syncBase = { date: source.date, items: source.items };
  const before = JSON.stringify(source);
  const object = decodeStudyRecord(source), string = decodeStudyRecord(before);
  assert.equal(object.ok, true); assert.equal(string.ok, true);
  if (!object.ok || !string.ok) return;
  assert.deepEqual(object.record, string.record);
  object.record.items[0].minutes = '30';
  string.record.items[0].f.words![0] = { id: 'new', text: 'apple' };
  assert.equal(JSON.stringify(source), before);
  assert.equal(object.record.syncBase!.items[0].minutes, '15');
  assert.equal((string.record.syncBase!.items[0].f.words![0] as { text: string }).text, 'ability');
});

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

test('migrates schema one records without inventing a bedtime', () => {
  const decoded = decodeStudyRecord({ schemaVersion: 1, date: '2026-09-01', wakeTime: '07:20', items: [] });
  assert.equal(decoded.ok, true);
  if (!decoded.ok) return;
  assert.equal(decoded.migrated, true);
  assert.equal(decoded.record.wakeTime, '07:20');
  assert.equal(decoded.record.bedtime, undefined);
});
