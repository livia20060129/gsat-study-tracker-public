import assert from 'node:assert/strict';
import test from 'node:test';
import {
  parseProgressImportText,
  progressImportBackupPayload,
  progressImportResultText,
} from '../src/application/progressImport.ts';

test('progress import parses supported single, array, records and date-map shapes', () => {
  const samples = [
    JSON.stringify({ date: '2026-09-03', items: [] }),
    JSON.stringify([{ date: '2026-09-03', items: [] }]),
    JSON.stringify({ records: [{ date: '2026-09-03', items: [] }] }),
    JSON.stringify({ '2026-09-03': { items: [] } }),
  ];

  for (const sample of samples) {
    const parsed = parseProgressImportText(sample);
    assert.equal(parsed.ok, true);
    if (parsed.ok) assert.equal(parsed.records[0]?.date, '2026-09-03');
  }
});

test('progress import rejects the complete batch when any record is invalid', () => {
  const parsed = parseProgressImportText(JSON.stringify([
    { date: '2026-09-03', items: [] },
    { date: '2026-02-30', items: [] },
  ]));

  assert.equal(parsed.ok, false);
  if (!parsed.ok) assert.match(parsed.errors.join(' '), /第 2 筆紀錄/);
});

test('progress import rejects invalid item fields and mismatched date-map dates', () => {
  const badItems = parseProgressImportText(JSON.stringify({ date: '2026-09-03', items: {} }));
  assert.equal(badItems.ok, false);

  const mismatched = parseProgressImportText(JSON.stringify({
    '2026-09-03': { date: '2026-09-04', items: [] },
  }));
  assert.equal(mismatched.ok, false);
  if (!mismatched.ok) assert.match(mismatched.errors.join(' '), /不一致/);
});

test('progress import deeply validates nested items, words, timers, and duplicate IDs', () => {
  const parsed = parseProgressImportText(JSON.stringify({
    date: '2026-09-03',
    items: [{
      id: 'parent', type: 'general', done: false, required: true, minutes: '',
      f: {
        words: [{ id: 'word-1', text: 123, noun: 'yes' }],
        timeTracking: { mode: 'clock', accumulatedSeconds: -1, startedAt: 'now' },
        groupedWorkEntries: [
          { id: 'same', type: 'general', done: false, required: true, minutes: '', f: {} },
          { id: 'same', type: 'general', done: 'yes', required: true, minutes: '', f: {} },
        ],
      },
    }],
  }));

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    const message = parsed.errors.join(' ');
    assert.match(message, /text必須是文字/);
    assert.match(message, /noun必須是 true 或 false/);
    assert.match(message, /timeTracking\.mode/);
    assert.match(message, /重複 id/);
    assert.match(message, /done必須是 true 或 false/);
  }
});

test('progress import rejects unsupported schemas and unsafe object keys', () => {
  const future = parseProgressImportText(JSON.stringify({ schemaVersion: 999, date: '2026-09-03', items: [] }));
  assert.equal(future.ok, false);
  if (!future.ok) assert.match(future.errors.join(' '), /unsupported-schema-version/);

  const unsafe = parseProgressImportText('{"date":"2026-09-03","items":[],"__proto__":{"polluted":true}}');
  assert.equal(unsafe.ok, false);
  if (!unsafe.ok) assert.match(unsafe.errors.join(' '), /不允許的欄位 __proto__/);
});

test('progress import validates timer data inside natural integration children', () => {
  const parsed = parseProgressImportText(JSON.stringify({
    date: '2026-09-13',
    items: [{
      id: 'natural', type: 'scienceReview', done: false, required: true, minutes: '',
      f: {
        calendarIntegrationEntries: [{
          id: 'natural-child', subject: '生物', done: true, minutes: -5,
          f: { timeTracking: { mode: 'clock', accumulatedSeconds: -1, startedAt: 'now' } },
        }],
      },
    }],
  }));

  assert.equal(parsed.ok, false);
  if (!parsed.ok) {
    const message = parsed.errors.join(' ');
    assert.match(message, /minutes 必須是文字或非負數字/);
    assert.match(message, /timeTracking\.mode/);
  }
});

test('progress import result reports every local and cloud outcome', () => {
  assert.equal(progressImportResultText({
    localSucceeded: 4,
    localFailed: 1,
    cloudSucceeded: 2,
    cloudConflicts: 1,
    cloudFailed: 1,
    cloudSkipped: 0,
  }), '本機成功 4 筆、失敗 1 筆；雲端成功 2 筆、衝突 1 筆、失敗 1 筆、未同步 0 筆。');
});

test('progress import backup is a detached copy', () => {
  const source = [{ date: '2026-09-03', items: [], notes: 'before' }];
  const backup = progressImportBackupPayload(source, '2026-09-03T00:00:00.000Z');
  source[0].notes = 'after';
  assert.equal(backup.records[0]?.notes, 'before');
  assert.equal(backup.createdAt, '2026-09-03T00:00:00.000Z');
});
