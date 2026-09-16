import assert from 'node:assert/strict';
import test from 'node:test';

import { LocalStudyRecordRepository } from '../src/infrastructure/storage/localStudyRecordRepository.ts';
import {
  STUDY_RECORD_PAGE_SIZE,
  studyRecordSnapshotFromRow,
  SupabaseStudyRecordRepository,
  type SupabaseStudyRecordClient,
} from '../src/infrastructure/storage/supabaseStudyRecordRepository.ts';
import type { StudyRecord } from '../src/types.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  get length(): number { return this.values.size; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

const record = (date: string): StudyRecord => ({ date, items: [], notes: `note-${date}` });

test('local repository owns scoped keys and upgrades legacy records', () => {
  const storage = new MemoryStorage();
  storage.setItem('legacy:2026-09-01', JSON.stringify({ date: 'wrong', items: [], futureField: 'kept' }));
  const repository = new LocalStudyRecordRepository(storage, 'user-a:');

  const legacy = repository.loadFromPrefix('legacy:', '2026-09-01');
  assert.equal(legacy?.date, '2026-09-01');
  assert.equal((legacy as unknown as Record<string, unknown>).futureField, 'kept');

  assert.equal(repository.save(record('2026-09-02')), true);
  assert.deepEqual(repository.listDates(), ['2026-09-02']);
  repository.setPrefix('user-b:');
  assert.equal(repository.load('2026-09-02'), null);
  assert.deepEqual(repository.listDates('user-a:'), ['2026-09-02']);
});

test('local repository preserves an undecodable payload and creates a recovery backup', () => {
  const storage = new MemoryStorage();
  const raw = '{broken json';
  storage.setItem('user-a:2026-09-05', raw);
  const repository = new LocalStudyRecordRepository(storage, 'user-a:');

  const result = repository.loadResult('2026-09-05');
  assert.equal(result.status, 'invalid');
  if (result.status !== 'invalid') return;
  assert.equal(result.issue.error, 'invalid-json');
  assert.equal(result.issue.raw, raw);
  assert.equal(storage.getItem('user-a:2026-09-05'), raw);
  const backup = JSON.parse(storage.getItem(result.issue.backupKey) ?? '{}');
  assert.equal(backup.raw, raw);
  assert.equal(backup.date, '2026-09-05');
  assert.deepEqual(repository.listDates(), ['2026-09-05']);
});

test('Supabase row conversion applies authoritative revision metadata', () => {
  const snapshot = studyRecordSnapshotFromRow({
    study_date: '2026-09-03',
    payload: { date: 'wrong', items: [], localDirty: true },
    revision: 7,
    updated_at: '2026-09-03T10:00:00Z',
  });
  assert.equal(snapshot?.record.date, '2026-09-03');
  assert.equal(snapshot?.record.serverRevision, 7);
  assert.equal(snapshot?.record.localDirty, false);
  assert.equal(snapshot?.record.serverUpdatedAt, '2026-09-03T10:00:00Z');
});

test('Supabase repository hides table and RPC details from callers', async () => {
  const rows = [{
    study_date: '2026-09-04',
    payload: { date: '2026-09-04', items: [] },
    revision: 2,
    updated_at: '2026-09-04T11:00:00Z',
  }];
  const calls: string[] = [];
  const query = {
    gte(column: string, value: string) { calls.push(`gte:${column}:${value}`); return this; },
    gt(column: string, value: string) { calls.push(`gt:${column}:${value}`); return this; },
    eq(column: string, value: string) { calls.push(`eq:${column}:${value}`); return this; },
    or(filters: string) { calls.push(`or:${filters}`); return this; },
    order() { calls.push('order'); return this; },
    limit() { calls.push('limit'); return Promise.resolve({ data: rows, error: null }); },
    maybeSingle() { calls.push('single'); return Promise.resolve({ data: rows[0], error: null }); },
  };
  const client = {
    from(table: string) {
      calls.push(`from:${table}`);
      return { select: (columns: string) => { calls.push(`select:${columns}`); return query; } };
    },
    rpc(name: string, parameters: Record<string, unknown>) {
      calls.push(`rpc:${name}:${String(parameters.p_base_revision)}`);
      return Promise.resolve({ data: [{ applied: true, payload: rows[0].payload, revision: 3, updated_at: rows[0].updated_at }], error: null });
    },
  } as unknown as SupabaseStudyRecordClient;
  const repository = new SupabaseStudyRecordRepository(client);

  const loaded = await repository.loadMany('2026-09-01T00:00:00Z');
  assert.equal(loaded[0]?.record.date, '2026-09-04');
  const saved = await repository.save(record('2026-09-04'), 2);
  assert.equal(saved.applied, true);
  assert.equal(saved.revision, 3);
  assert.ok(calls.includes('from:study_records'));
  assert.ok(calls.includes('rpc:upsert_study_record:2'));
});

test('Supabase repository reads every page with an updated_at + study_date cursor', async () => {
  const rows = Array.from({ length: STUDY_RECORD_PAGE_SIZE + 1 }, (_, index) => {
    const studyDate = new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10);
    return {
      study_date: studyDate,
      payload: { date: studyDate, items: [] },
      revision: 1,
      updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    };
  });
  const pages = [rows.slice(0, STUDY_RECORD_PAGE_SIZE), rows.slice(STUDY_RECORD_PAGE_SIZE)];
  const filters: string[] = [];
  let requestIndex = 0;
  const client = {
    from() {
      return {
        select() {
          const page = pages[requestIndex++] ?? [];
          return {
            gte() { return this; },
            gt() { return this; },
            eq() { return this; },
            or(value: string) { filters.push(value); return this; },
            order() { return this; },
            limit() { return Promise.resolve({ data: page, error: null }); },
            maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          };
        },
      };
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  } as unknown as SupabaseStudyRecordClient;

  const loaded = await new SupabaseStudyRecordRepository(client).loadMany();
  assert.equal(loaded.length, STUDY_RECORD_PAGE_SIZE + 1);
  assert.equal(requestIndex, 2);
  assert.equal(filters.length, 1);
  assert.match(filters[0], /updated_at\.gt\./);
  assert.match(filters[0], /study_date\.gt\./);
});

test('Supabase repository rejects the whole read when a later page fails', async () => {
  const fullPage = Array.from({ length: STUDY_RECORD_PAGE_SIZE }, (_, index) => ({
    study_date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    payload: { items: [] },
    revision: 1,
    updated_at: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
  }));
  let requestIndex = 0;
  const client = {
    from() {
      return {
        select() {
          const current = requestIndex++;
          return {
            gte() { return this; },
            gt() { return this; },
            eq() { return this; },
            or() { return this; },
            order() { return this; },
            limit() {
              return Promise.resolve(current === 0
                ? { data: fullPage, error: null }
                : { data: null, error: { message: 'page two failed' } });
            },
            maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          };
        },
      };
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  } as unknown as SupabaseStudyRecordClient;

  await assert.rejects(
    () => new SupabaseStudyRecordRepository(client).loadMany(),
    /page two failed/,
  );
  assert.equal(requestIndex, 2);
});

test('Supabase repository fails closed when a cloud payload cannot be decoded', async () => {
  const client = {
    from() {
      return {
        select() {
          return {
            gte() { return this; }, gt() { return this; }, eq() { return this; }, or() { return this; }, order() { return this; },
            limit() { return Promise.resolve({ data: [{ study_date: '2026-09-06', payload: { schemaVersion: 999, items: [] }, revision: 1, updated_at: '2026-09-06T00:00:00Z' }], error: null }); },
            maybeSingle() { return Promise.resolve({ data: null, error: null }); },
          };
        },
      };
    },
    rpc() { return Promise.resolve({ data: null, error: null }); },
  } as unknown as SupabaseStudyRecordClient;

  await assert.rejects(
    () => new SupabaseStudyRecordRepository(client).loadMany(),
    /2026-09-06.*unsupported-schema-version.*沒有把它當成空白資料/,
  );
});
