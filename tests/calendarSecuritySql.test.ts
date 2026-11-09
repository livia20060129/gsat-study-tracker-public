import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

// This Vault test double verifies RPC access, migration and lifecycle contracts.
// Encryption itself is provided by the hosted, installed supabase_vault extension.
test('Calendar migration protects credentials, consumes nonces once, and serializes syncs across owners', async () => {
  const db = new PGlite();
  const user='00000000-0000-0000-0000-000000000154';
  const owner='00000000-0000-0000-0000-000000000155';
  const next='00000000-0000-0000-0000-000000000156';
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create schema vault;
      create table vault.secrets(id uuid primary key default gen_random_uuid(), secret text not null);
      create view vault.decrypted_secrets as select id,secret as decrypted_secret from vault.secrets;
      create function vault.create_secret(value text) returns uuid language sql as $$ insert into vault.secrets(secret) values(value) returning id $$;
      create function vault.update_secret(key uuid,value text) returns void language sql as $$ update vault.secrets set secret=value where id=key $$;
      create table public.google_calendar_connections(user_id uuid primary key references auth.users(id) on delete cascade,
        calendar_id text default 'primary', client_id text, refresh_token text not null,access_token text,
        access_token_expires_at timestamptz,scope text,updated_at timestamptz,sync_error text);
      create function public.sync_calendar_tasks(text,jsonb,date,date) returns jsonb language sql security definer as $$ select '{}'::jsonb $$;
      insert into auth.users values('${user}');
      insert into public.google_calendar_connections(user_id,refresh_token,access_token) values('${user}','old-refresh','old-access');`);
    const sql=readFileSync(new URL('../supabase/migrations/20261109111803_public_calendar_security.sql',import.meta.url),'utf8')
      .replace(/^create extension if not exists supabase_vault with schema vault;$/m,'');
    await db.exec(sql);
    const row=(await db.query<{ refresh_token:null;access_token:null;refresh_secret_id:string }>('select * from public.google_calendar_connections')).rows[0];
    assert.equal(row.refresh_token,null); assert.equal(row.access_token,null); assert.ok(row.refresh_secret_id);
    await db.exec('set role anon');
    await assert.rejects(db.query(`select public.calendar_connection_read('${user}')`), /permission denied/);
    await assert.rejects(db.query(`select public.sync_calendar_tasks('token','[]','2026-01-01','2026-01-02')`), /permission denied/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query(`select public.calendar_connection_read('${user}')`), /permission denied/);
    await db.exec('set role service_role');
    const connection=(await db.query<{c:{refresh_token:string}}>(`select public.calendar_connection_read('${user}') as c`)).rows[0].c;
    assert.equal(connection.refresh_token,'old-refresh');
    await db.query(`select public.calendar_connection_write('${user}',$1::jsonb)`,[JSON.stringify({access_token:'renewed-access'})]);
    const renewed=(await db.query<{c:{refresh_token:string;access_token:string}}>(`select public.calendar_connection_read('${user}') as c`)).rows[0].c;
    assert.equal(renewed.refresh_token,'old-refresh'); assert.equal(renewed.access_token,'renewed-access');
    await db.query(`select public.calendar_oauth_nonce_issue('${user}','${owner}','client',now()+interval '15 minutes')`);
    const consume=async (client: string) => (await db.query<{v:boolean}>(`select public.calendar_oauth_nonce_consume('${user}','${owner}',$1) as v`,[client])).rows[0].v;
    assert.equal(await consume('wrong-client'),false);
    assert.equal(await consume('client'),true); assert.equal(await consume('client'),false);
    const begin=async (id:string) => (await db.query<{v:boolean}>(`select public.calendar_sync_begin('${user}',$1) as v`,[id])).rows[0].v;
    assert.equal(await begin(owner),true); assert.equal(await begin(next),false);
    await db.query(`select public.calendar_sync_end('${user}','${next}')`);
    assert.equal(await begin(next),false);
    await db.query(`select public.calendar_sync_end('${user}','${owner}')`);
    assert.equal(await begin(next),false); // cooldown still applies after release
    await db.exec(`reset role; update calendar_private.sync_leases set started_at=now()-interval '31 seconds'; set role service_role;`);
    assert.equal(await begin(next),true);
    await db.exec('reset role');
    assert.equal((await db.query<{n:number}>('select count(*)::int as n from vault.secrets')).rows[0].n,2);
    await db.query(`delete from public.google_calendar_connections where user_id='${user}'`);
    assert.equal((await db.query<{n:number}>('select count(*)::int as n from vault.secrets')).rows[0].n,0);
    await db.exec('set role service_role');
    await db.query(`select public.calendar_connection_write('${user}',$1::jsonb)`,[JSON.stringify({refresh_token:'test-cascade-token'})]);
    await db.exec(`reset role; delete from auth.users where id='${user}'`);
    assert.equal((await db.query<{n:number}>('select count(*)::int as n from vault.secrets')).rows[0].n,0);
    assert.equal((await db.query<{n:number}>('select count(*)::int as n from calendar_private.sync_leases')).rows[0].n,0);
  } finally { await db.close(); }
});
