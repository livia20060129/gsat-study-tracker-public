import assert from 'node:assert/strict';
import test from 'node:test';

import { LatestTaskQueue } from '../src/storage/latestTaskQueue.ts';

function deferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('serializes one date and saves the newest complete snapshot', async () => {
  const firstSave = deferred();
  const savedItemCounts: number[] = [];
  let active = 0;
  let maximumActive = 0;

  const queue = new LatestTaskQueue<string, { items: string[] }>(
    60_000,
    async (_date, record) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      savedItemCounts.push(record.items.length);
      if (savedItemCounts.length === 1) await firstSave.promise;
      active -= 1;
    },
  );

  queue.enqueue('2026-08-31', { items: ['數學'] });
  const flushing = queue.flush('2026-08-31');
  await Promise.resolve();
  await Promise.resolve();

  queue.enqueue('2026-08-31', { items: ['數學', '英文'] });
  queue.enqueue('2026-08-31', { items: ['數學', '英文', '物理'] });
  firstSave.resolve();
  await flushing;

  assert.equal(maximumActive, 1);
  assert.deepEqual(savedItemCounts, [1, 3]);
});

test('allows different dates to save independently', async () => {
  const blockers = new Map([
    ['2026-08-31', deferred()],
    ['2026-09-01', deferred()],
  ]);
  const started: string[] = [];
  const queue = new LatestTaskQueue<string, number>(60_000, async (date) => {
    started.push(date);
    await blockers.get(date)?.promise;
  });

  queue.enqueue('2026-08-31', 1);
  queue.enqueue('2026-09-01', 1);
  const first = queue.flush('2026-08-31');
  const second = queue.flush('2026-09-01');
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(new Set(started), new Set(['2026-08-31', '2026-09-01']));
  blockers.forEach((blocker) => blocker.resolve());
  await Promise.all([first, second]);
});
