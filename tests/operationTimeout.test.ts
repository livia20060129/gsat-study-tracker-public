import assert from 'node:assert/strict';
import test from 'node:test';

import { withOperationTimeout } from '../src/application/cloud/operationTimeout.ts';

test('returns an external operation result before the deadline', async () => {
  const result = await withOperationTimeout(Promise.resolve('ready'), {
    timeoutMs: 100,
    message: 'timed out',
  });

  assert.equal(result, 'ready');
});

test('rejects and runs cancellation when an external operation stalls', async () => {
  let cancelled = false;
  const stalled = new Promise<never>(() => undefined);

  await assert.rejects(
    withOperationTimeout(stalled, {
      timeoutMs: 5,
      message: 'Cloud stalled',
      onTimeout: () => { cancelled = true; },
    }),
    /Cloud stalled/,
  );
  assert.equal(cancelled, true);
});
