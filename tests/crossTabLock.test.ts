import assert from 'node:assert/strict';
import test from 'node:test';

import {
  crossTabLockStoragePrefix,
  withCrossTabLock,
  withStorageCrossTabLock,
} from '../src/storage/crossTabLock.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function nextTurn(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test('fallback lock serializes operations for the same study date', async () => {
  const blocker = deferred();
  const order: string[] = [];

  const first = withCrossTabLock('record:2026-09-03', async () => {
    order.push('first:start');
    await blocker.promise;
    order.push('first:end');
  }, null);
  const second = withCrossTabLock('record:2026-09-03', async () => {
    order.push('second:start');
  }, null);

  await nextTurn();
  assert.deepEqual(order, ['first:start']);
  blocker.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['first:start', 'first:end', 'second:start']);
});

test('fallback lock does not block a different study date', async () => {
  const blocker = deferred();
  const started: string[] = [];

  const first = withCrossTabLock('record:2026-09-03', async () => {
    started.push('09-03');
    await blocker.promise;
  }, null);
  const second = withCrossTabLock('record:2026-09-04', async () => {
    started.push('09-04');
  }, null);

  await nextTurn();
  assert.deepEqual(new Set(started), new Set(['09-03', '09-04']));
  blocker.resolve();
  await Promise.all([first, second]);
});

test('localStorage bakery fallback serializes separate browser-tab contenders', async () => {
  const storage = new MemoryStorage();
  const blocker = deferred();
  const order: string[] = [];
  const options = { leaseMs: 1_000, acquireTimeoutMs: 2_000, pollMs: 5 };

  const first = withStorageCrossTabLock('record:2026-09-05', async () => {
    order.push('tab-a:start');
    await blocker.promise;
    order.push('tab-a:end');
  }, storage, { ...options, ownerId: 'tab-a' });
  const second = withStorageCrossTabLock('record:2026-09-05', async () => {
    order.push('tab-b:start');
  }, storage, { ...options, ownerId: 'tab-b' });

  await nextTurn();
  assert.deepEqual(order, ['tab-a:start']);
  blocker.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(order, ['tab-a:start', 'tab-a:end', 'tab-b:start']);
});

test('localStorage bakery fallback removes expired contenders after a crashed tab', async () => {
  const storage = new MemoryStorage();
  const name = 'record:2026-09-06';
  const prefix = crossTabLockStoragePrefix(name);
  storage.setItem(`${prefix}ticket:crashed`, JSON.stringify({ owner: 'crashed', number: 1, expiresAt: Date.now() - 1 }));
  let ran = false;

  await withStorageCrossTabLock(name, () => { ran = true; }, storage, {
    ownerId: 'healthy', leaseMs: 1_000, acquireTimeoutMs: 2_000, pollMs: 5,
  });

  assert.equal(ran, true);
  assert.equal(storage.length, 0);
});
