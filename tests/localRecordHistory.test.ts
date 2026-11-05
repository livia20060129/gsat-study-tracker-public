import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalRecordHistory, readBrowserRecordHistory } from '../src/infrastructure/storage/localRecordHistory.ts';
import { LocalStudyRecordRepository } from '../src/infrastructure/storage/localStudyRecordRepository.ts';

function storageFixture() {
  const values = new Map<string, string>();
  let reads = 0;
  const storage = {
    get length() { return values.size; },
    key(index: number) { return [...values.keys()][index] ?? null; },
    getItem(key: string) { reads++; return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  return { storage, reads: () => reads };
}
const prefix = 'study-v11:guest:';

test('history reuses unchanged days, reads only an invalidated date and never exposes mutable cached records', () => {
  const { storage, reads } = storageFixture();
  const repository = new LocalStudyRecordRepository(storage, prefix);
  for (const date of ['2026-11-03', '2026-11-04']) repository.save({ date, items: [], notes: date });
  const history = new LocalRecordHistory(storage);
  const first = history.read(prefix);
  assert.equal(reads(), 2);
  assert.equal(history.read(prefix)[0], first[0]);
  assert.equal(reads(), 2);
  assert.throws(() => { first[0].notes = '不應更改快取'; }, TypeError);
  storage.setItem(prefix + '2026-11-04', JSON.stringify({ date: '2026-11-04', items: [], notes: '新內容' }));
  history.invalidate(prefix + '2026-11-04');
  assert.equal(history.read(prefix)[1].notes, '新內容');
  assert.equal(reads(), 3);
});

test('repository saves and deletes invalidate shared history, while account switches and damaged rows stay isolated', () => {
  const { storage } = storageFixture();
  const repository = new LocalStudyRecordRepository(storage, prefix);
  repository.save({ date: '2026-11-04', items: [], notes: '訪客' });
  assert.equal(readBrowserRecordHistory(storage, prefix)[0].notes, '訪客');
  repository.save({ date: '2026-11-04', items: [], notes: '已更新' });
  assert.equal(readBrowserRecordHistory(storage, prefix)[0].notes, '已更新');
  const account = 'study-v11:user:other:';
  storage.setItem(account + '2026-11-04', JSON.stringify({ date: '2026-11-04', items: [], notes: '另一帳號' }));
  assert.equal(readBrowserRecordHistory(storage, account)[0].notes, '另一帳號');
  assert.equal(readBrowserRecordHistory(storage, prefix)[0].notes, '已更新');
  repository.remove('2026-11-04');
  assert.deepEqual(readBrowserRecordHistory(storage, prefix), []);
  storage.setItem(prefix + '2026-11-04', '{invalid');
  assert.deepEqual(readBrowserRecordHistory(storage, prefix, true), []);
});

test('a reported metadata insertion does not make the next date change reread the whole history', () => {
  const { storage, reads } = storageFixture();
  for (const date of ['2026-11-03', '2026-11-04']) storage.setItem(prefix + date, JSON.stringify({ date, items: [] }));
  const history = new LocalRecordHistory(storage);
  history.read(prefix);
  storage.setItem('study-v11:meta:other', '1');
  history.invalidate('study-v11:meta:other');
  storage.setItem(prefix + '2026-11-04', JSON.stringify({ date: '2026-11-04', items: [], notes: '新內容' }));
  history.invalidate(prefix + '2026-11-04');
  assert.equal(history.read(prefix)[1].notes, '新內容');
  assert.equal(reads(), 3);
});
