import assert from 'node:assert/strict';
import test from 'node:test';
import { createPersistentAuthStorage, type AuthPersistence, type AuthStorageEntry } from '../src/infrastructure/storage/browserAuthStorage.ts';
import { createSessionRestorationGate } from '../src/application/cloud/sessionRestoration.ts';
import { ACTIVE_RECORD_PREFIX_KEY, initialRecordPrefix } from '../src/storage/local.ts';

const key = 'sb-test-auth-token';
const account = { id: 'account-a' };

function fixture(): { persistence: AuthPersistence; entries: Map<string, AuthStorageEntry>; legacy: Storage } {
  const entries = new Map<string, AuthStorageEntry>();
  const values = new Map<string, string>();
  const persistence: AuthPersistence = {
    async read(key) { return entries.get(key); },
    async write(key, value) { entries.set(key, { value }); },
    async importIfMissing(key, value) {
      if (!entries.has(key)) entries.set(key, { value });
      return entries.get(key)!;
    },
  };
  const legacy: Storage = {
    get length() { return values.size; }, clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(index) { return [...values.keys()][index] ?? null; },
    removeItem(key) { values.delete(key); }, setItem(key, value) { values.set(key, value); },
  };
  return { persistence, entries, legacy };
}

test('legacy SDK sessions migrate without changing their key, token contents or unrelated records', async () => {
  const state = fixture();
  state.legacy.setItem(key, '{"refresh_token":"legacy","user":{"id":"account-a"}}');
  state.legacy.setItem('study-v11:guest:2026-11-02', 'keep');
  const storage = createPersistentAuthStorage(state.persistence, state.legacy);
  assert.equal(await storage.getItem(key), state.legacy.getItem(key));
  assert.equal(state.entries.get(key)?.value, state.legacy.getItem(key));
  assert.equal(state.legacy.getItem('study-v11:guest:2026-11-02'), 'keep');
});

test('failed localStorage writes never reduce a successful login to page memory', async () => {
  const state = fixture();
  state.legacy.setItem = function unavailable(): void { throw new Error('QuotaExceededError'); };
  await createPersistentAuthStorage(state.persistence, state.legacy).setItem(key, 'new-session');
  const nextPage = createPersistentAuthStorage(state.persistence, state.legacy);
  assert.equal(await nextPage.getItem(key), 'new-session');
});

test('refresh commits the latest session before resolving and the next page sees it', async () => {
  const state = fixture();
  const storage = createPersistentAuthStorage(state.persistence, state.legacy);
  await storage.setItem(key, 'old-refresh');
  await storage.setItem(key, 'rotated-refresh');
  assert.equal(state.legacy.getItem(key), 'rotated-refresh');
  assert.equal(await createPersistentAuthStorage(state.persistence, state.legacy).getItem(key), 'rotated-refresh');
});

test('failed persistent writes reject login instead of reporting a nonpersistent success', async () => {
  const state = fixture();
  state.persistence.write = async function fail(): Promise<void> { throw new Error('persistent storage unavailable'); };
  await assert.rejects(createPersistentAuthStorage(state.persistence, state.legacy).setItem(key, 'new-session'), /unavailable/);
  assert.equal(state.legacy.getItem(key), null);
});

test('sign-out tombstones prevent resurrecting a legacy session even when its removal fails', async () => {
  const state = fixture();
  state.legacy.setItem(key, 'stale-session');
  state.legacy.removeItem = function unavailable(): void { throw new Error('blocked'); };
  await createPersistentAuthStorage(state.persistence, state.legacy).removeItem(key);
  assert.equal(state.legacy.getItem(key), 'stale-session');
  assert.equal(await createPersistentAuthStorage(state.persistence, state.legacy).getItem(key), null);
});

test('a concurrent sign-out wins over a legacy migration that already read the old token', async () => {
  const state = fixture();
  state.legacy.setItem(key, 'old-session');
  state.persistence.importIfMissing = async function race(key): Promise<AuthStorageEntry> {
    state.entries.set(key, { value: null });
    return state.entries.get(key)!;
  };
  assert.equal(await createPersistentAuthStorage(state.persistence, state.legacy).getItem(key), null);
});

test('unreadable legacy storage does not prevent use of an existing persistent session', async () => {
  const state = fixture();
  state.entries.set(key, { value: 'saved-session' });
  state.legacy.getItem = function blocked(): never { throw new Error('blocked'); };
  const storage = createPersistentAuthStorage(state.persistence, state.legacy);
  assert.equal(await storage.getItem(key), 'saved-session');
  assert.equal(await storage.getItem('other-project'), null);
});

function gateFixture(): { gate: ReturnType<typeof createSessionRestorationGate<typeof account>>; applied: Array<typeof account | null>; flush(): void } {
  const applied: Array<typeof account | null> = [];
  const pending: Array<() => void> = [];
  const gate = createSessionRestorationGate(function apply(user: typeof account | null): void { applied.push(user); }, function schedule(callback): void { pending.push(callback); });
  return { gate, applied, flush() { for (const callback of pending.splice(0)) callback(); } };
}

test('an INITIAL_SESSION null notification alone never clears an existing account', () => {
  const state = gateFixture();
  state.gate.event('SIGNED_IN', account); state.flush();
  state.gate.event('INITIAL_SESSION', null); state.flush();
  assert.deepEqual(state.applied, [account]);
});

test('a late initial read cannot overwrite a newer sign-in or confirmed sign-out', () => {
  for (const event of ['SIGNED_IN', 'SIGNED_OUT']) {
    const state = gateFixture(), version = state.gate.version();
    state.gate.event(event, event === 'SIGNED_IN' ? account : null);
    state.gate.initial(version, event === 'SIGNED_IN' ? null : account);
    state.flush();
    assert.deepEqual(state.applied, [event === 'SIGNED_IN' ? account : null]);
  }
});

test('queued stale auth callbacks cannot switch the page back to a previous user', () => {
  const state = gateFixture();
  state.gate.event('SIGNED_OUT', null);
  state.gate.event('SIGNED_IN', account);
  state.flush();
  assert.deepEqual(state.applied, [account]);
});

test('an authoritative initial read with no session still selects the isolated guest scope', () => {
  const state = gateFixture();
  state.gate.initial(state.gate.version(), null); state.flush();
  assert.deepEqual(state.applied, [null]);
});

test('restoration retains only the explicitly selected local scope and never guesses another account', () => {
  const { legacy } = fixture();
  legacy.setItem('study-v11:user:other:2026-11-02', 'other account');
  assert.equal(initialRecordPrefix(legacy), 'study-v11:guest:');
  legacy.setItem(ACTIVE_RECORD_PREFIX_KEY, 'study-v11:user:account-a:');
  assert.equal(initialRecordPrefix(legacy), 'study-v11:user:account-a:');
  legacy.setItem(ACTIVE_RECORD_PREFIX_KEY, 'unexpected');
  assert.equal(initialRecordPrefix(legacy), 'study-v11:guest:');
});
