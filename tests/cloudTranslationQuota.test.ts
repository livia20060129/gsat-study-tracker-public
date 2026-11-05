import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { CloudTranslationQuota } from '../supabase/functions/_shared/cloudTranslationQuota.ts';

const owner = '00000000-0000-0000-0000-000000000001';
const another = '00000000-0000-0000-0000-000000000002';
let db: PGlite;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('${owner}'), ('${another}');`);
  for (const file of ['20261105130048_cloud_translation_usage.sql', '20261105145700_cloud_translation_monthly_limit.sql', '20261105222021_cloud_translation_request_quota.sql']) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'));
  }
});
after(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec('reset role; truncate public.cloud_translation_monthly_usage, public.cloud_translation_usage, private.cloud_translation_requests; set role service_role;');
});

async function reserve(characters: number, user = owner, receipt = randomUUID(), limit = 5000, globalLimit = 200000): Promise<CloudTranslationQuota> {
  const result = await db.query<{ quota: CloudTranslationQuota }>('select public.reserve_cloud_translation_request($1::uuid,$2::uuid,$3::int,$4::int,$5::int) as quota', [user, receipt, characters, limit, globalLimit]);
  return result.rows[0].quota;
}
async function seedUsage(used: number): Promise<void> {
  await db.query(`insert into public.cloud_translation_monthly_usage (usage_month,user_id,characters)
    values (date_trunc('month',now() at time zone 'Asia/Taipei')::date,$1::uuid,$2)`, [owner, used]);
}

test('the actual migration counts characters and returns a Taiwan monthly reset with a hard 5000 cap', async () => {
  const quota = await reserve(8, owner, randomUUID(), 5000000);
  assert.deepEqual({ ...quota, resetsAt: '' }, { allowed: true, used: 8, remaining: 4992, limit: 5000, resetsAt: '' });
  const expected = await db.query<{ reset: string }>(`select to_char(date_trunc('month',now() at time zone 'Asia/Taipei') + interval '1 month','YYYY-MM-DD') || 'T00:00:00+08:00' as reset`);
  assert.equal(quota.resetsAt, expected.rows[0].reset);
});
test('the last character succeeds once and competing further reservations cannot exceed the monthly limit', async () => {
  await seedUsage(4999);
  const results = await Promise.all(Array.from({ length: 12 }, () => reserve(1)));
  assert.equal(results.filter(result => result.allowed).length, 1);
  assert.ok(results.every(result => result.used === 5000 && result.remaining === 0));
});
test('retries share a receipt, never debit twice, and reject changed character counts', async () => {
  const receipt = randomUUID();
  const results = await Promise.all([reserve(7, owner, receipt), reserve(7, owner, receipt)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].used, 7);
  await assert.rejects(reserve(8, owner, receipt), /Reservation mismatch/);
  assert.equal((await reserve(1)).used, 8);
});
test('accounts keep independent counters and cannot receive another account receipt', async () => {
  await seedUsage(5000);
  const receipt = randomUUID();
  assert.equal((await reserve(10, owner, receipt)).allowed, false);
  assert.equal((await reserve(10, another, receipt)).used, 10);
});
test('a daily global stop does not debit the monthly account counter', async () => {
  const quota = await reserve(5, owner, randomUUID(), 5000, 4);
  assert.equal(quota.allowed, false);
  assert.equal(quota.used, 0);
  assert.equal((await reserve(1)).used, 1);
});
test('browser roles cannot inspect counters or invoke either reservation function', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of ['public.cloud_translation_monthly_usage', 'public.cloud_translation_usage', 'private.cloud_translation_requests']) {
      await assert.rejects(db.query(`select * from ${table}`), /permission denied/);
    }
    await assert.rejects(reserve(1), /permission denied/);
    await assert.rejects(db.query(`select public.reserve_cloud_translation_usage($1::uuid,1,5000,200000)`, [owner]), /permission denied/);
  }
});
test('invalid sizes fail closed and a lower administrator cap is respected', async () => {
  for (const count of [0, -1, 2001]) await assert.rejects(reserve(count), /Invalid quota request/);
  assert.equal((await reserve(6, owner, randomUUID(), 5)).allowed, false);
  assert.equal((await reserve(5, owner, randomUUID(), 5)).remaining, 0);
});
test('Taiwan month boundaries resolve correctly before the UTC month changes', async () => {
  const result = await db.query<{ month: string }>(`select to_char(date_trunc('month',t at time zone 'Asia/Taipei'),'YYYY-MM-DD') as month
    from (values ('2026-10-31T15:59:59Z'::timestamptz),('2026-10-31T16:00:00Z'::timestamptz)) as times(t) order by t`);
  assert.deepEqual(result.rows.map(row => row.month), ['2026-10-01', '2026-11-01']);
});
