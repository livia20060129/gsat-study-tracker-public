import assert from 'node:assert/strict';
import test from 'node:test';

import { chunksOf, collectStringKeysetPages } from '../supabase/functions/_shared/keysetPagination.ts';

test('Edge pagination collects every page and passes the last stable key forward', async () => {
  const calls: Array<string | null> = [];
  const pages = [
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'c' }],
  ];
  const rows = await collectStringKeysetPages(
    async (cursor) => {
      calls.push(cursor);
      return pages[calls.length - 1] ?? [];
    },
    (row) => row.id,
    2,
  );

  assert.deepEqual(rows.map((row) => row.id), ['a', 'b', 'c']);
  assert.deepEqual(calls, [null, 'b']);
});

test('Edge pagination detects a cursor that does not advance', async () => {
  await assert.rejects(
    () => collectStringKeysetPages(async () => [{ id: 'same' }], (row) => row.id, 1),
    /did not advance/,
  );
});

test('chunking keeps write and delete requests bounded', () => {
  assert.deepEqual(chunksOf([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.throws(() => chunksOf([1], 0), /positive integer/);
});
