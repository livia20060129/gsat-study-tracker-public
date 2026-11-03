import assert from 'node:assert/strict';
import test from 'node:test';
import { CalendarScheduleContinuity, calendarSnapshotKey } from '../src/application/calendar/calendarScheduleContinuity.ts';

function row(key = 'one') {
  return { event_key: key, source_event_id: key, calendar_id: 'primary', event_date: '2026-10-29',
    title: 'math', description: 'p.151–162', category: 'math', event_updated_at: null };
}
function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test('successful schedules persist only scheduling fields and survive a same-account restart', () => {
  const store = storage();
  const state = new CalendarScheduleContinuity(store, () => '2026-10-30T01:00:00Z');
  state.activate('a');
  assert.equal(state.preservesRecords, true);
  state.accept(state.begin(), [{ ...row(), access_token: 'private', metadata: { token: 'private' } }]);
  assert.equal(state.source, 'fresh');
  assert.equal(state.preservesRecords, false);
  assert.equal(state.persisted, true);
  state.begin();
  assert.equal(state.preservesRecords, true);
  assert.doesNotMatch(store.getItem(calendarSnapshotKey('a'))!, /private|token|metadata/);
  const restored = new CalendarScheduleContinuity(store);
  restored.activate('a');
  assert.deepEqual(restored.snapshot?.rows, [row()]);
  restored.fail(restored.begin());
  assert.equal(restored.source, 'cached');
  assert.equal(restored.preservesRecords, true);
});

test('accounts and guests never share or overwrite their prior schedule', () => {
  const store = storage();
  const state = new CalendarScheduleContinuity(store);
  state.activate('a'); state.accept(state.begin(), [row('a')]);
  const prior = store.getItem(calendarSnapshotKey('a'));
  state.activate('b'); state.fail(state.begin());
  assert.equal(state.source, 'records');
  assert.equal(state.snapshot, null);
  assert.equal(store.getItem(calendarSnapshotKey('a')), prior);
  state.activate(null);
  assert.equal(state.snapshot, null);
  assert.equal(state.preservesRecords, false);
  state.activate('a');
  assert.equal(state.snapshot?.rows[0].event_key, 'a');
});

test('late requests cannot replace a newer request or an account after it signs out and back in', () => {
  const state = new CalendarScheduleContinuity(storage());
  state.activate('a');
  const old = state.begin(), latest = state.begin();
  state.accept(latest, [row('latest')]);
  assert.equal(state.accept(old, [row('late')]), false);
  assert.equal(state.fail(old), false);
  state.activate('b'); state.activate('a');
  assert.equal(state.accept(latest, [row('old-session')]), false);
  assert.equal(state.snapshot?.rows[0].event_key, 'latest');
});

test('a timed-out operation cannot later replace last-known-good data', () => {
  const store = storage();
  const state = new CalendarScheduleContinuity(store);
  state.activate('a'); state.accept(state.begin(), [row()]);
  const saved = store.getItem(calendarSnapshotKey('a'));
  const timedOut = state.begin();
  assert.equal(state.fail(timedOut), true);
  assert.equal(state.accept(timedOut, [row('too-late')]), false);
  assert.equal(store.getItem(calendarSnapshotKey('a')), saved);
});

test('successful empty schedules replace old data and are not mistaken for failed reads', () => {
  const store = storage(), state = new CalendarScheduleContinuity(store);
  state.activate('a'); state.accept(state.begin(), [row()]);
  state.accept(state.begin(), []);
  state.fail(state.begin());
  assert.deepEqual(state.snapshot?.rows, []);
  const restart = new CalendarScheduleContinuity(store); restart.activate('a');
  assert.deepEqual(restart.snapshot?.rows, []);
});

test('malformed responses and dates never replace the successful snapshot', () => {
  const store = storage(), state = new CalendarScheduleContinuity(store);
  state.activate('a'); state.accept(state.begin(), [row()]);
  const saved = store.getItem(calendarSnapshotKey('a'));
  for (const invalid of [null, {}, [row(), { ...row(), event_date: '2026-02-30' }], [{ event_key: 'missing' }]]) {
    const token = state.begin();
    assert.throws(() => state.accept(token, invalid), /格式不完整/);
    state.fail(token);
    assert.equal(store.getItem(calendarSnapshotKey('a')), saved);
    assert.equal(state.snapshot?.rows.length, 1);
  }
});

test('corrupt or mismatched cached owners are ignored without deleting the raw storage', () => {
  for (const raw of ['{bad', 'null', JSON.stringify({ version: 1, userId: 'b', savedAt: new Date().toISOString(), rows: [row()] })]) {
    const store = storage(); store.values.set(calendarSnapshotKey('a'), raw);
    const state = new CalendarScheduleContinuity(store); state.activate('a');
    assert.equal(state.snapshot, null); state.fail(state.begin());
    assert.equal(state.source, 'records');
    assert.equal(store.getItem(calendarSnapshotKey('a')), raw);
  }
});

test('quota errors preserve the in-memory schedule and the prior persisted snapshot', () => {
  const store = storage(), state = new CalendarScheduleContinuity(store);
  state.activate('a'); state.accept(state.begin(), [row()]);
  const prior = store.getItem(calendarSnapshotKey('a'));
  store.setItem = () => { throw new Error('quota'); };
  assert.equal(state.accept(state.begin(), [row('fresh')]), true);
  assert.equal(state.persisted, false);
  state.fail(state.begin());
  assert.equal(state.snapshot?.rows[0].event_key, 'fresh');
  assert.equal(store.getItem(calendarSnapshotKey('a')), prior);
});

test('explicit disconnect removes only this account snapshot and invalidates pending requests', () => {
  const store = storage(), state = new CalendarScheduleContinuity(store);
  state.activate('b'); state.accept(state.begin(), [row('b')]);
  state.activate('a'); state.accept(state.begin(), [row('a')]);
  const token = state.begin(); assert.equal(state.forget(token), true);
  assert.equal(store.getItem(calendarSnapshotKey('a')), null);
  assert.ok(store.getItem(calendarSnapshotKey('b')));
  assert.equal(state.accept(token, [row('resurrect')]), false);
  assert.equal(state.source, 'builtin');
});

test('a never-connected account keeps built-in scheduling, but prior Calendar records stay protected', () => {
  const state = new CalendarScheduleContinuity(storage()); state.activate('a');
  state.disconnected(state.begin());
  assert.equal(state.source, 'builtin');
  state.disconnected(state.begin(), true);
  assert.equal(state.source, 'records');
  assert.equal(state.preservesRecords, true);
});
