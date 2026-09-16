import assert from 'node:assert/strict';
import test from 'node:test';

import {
  incrementalSyncStart,
  latestServerWatermark,
  recordSyncWatermarkKey,
  validServerTimestamp,
} from '../src/storage/syncWatermark.ts';

test('creates a user-scoped sync watermark key', () => {
  assert.equal(
    recordSyncWatermarkKey('user-123'),
    'study-v11:meta:records-watermark:user-123',
  );
});

test('rejects invalid server timestamps', () => {
  assert.equal(validServerTimestamp('not-a-date'), null);
  assert.equal(incrementalSyncStart(undefined), null);
});

test('adds a safe overlap to incremental queries', () => {
  assert.equal(
    incrementalSyncStart('2026-08-27T10:00:00.000Z', 120_000),
    '2026-08-27T09:58:00.000Z',
  );
});

test('advances only to the latest valid server timestamp', () => {
  assert.equal(
    latestServerWatermark(
      [
        { updated_at: '2026-08-27T10:01:00Z' },
        { updated_at: 'invalid' },
        { updated_at: '2026-08-27T10:03:00Z' },
      ],
      '2026-08-27T10:02:00Z',
    ),
    '2026-08-27T10:03:00.000Z',
  );
});
