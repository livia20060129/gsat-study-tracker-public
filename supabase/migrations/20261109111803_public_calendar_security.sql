-- Server-only Calendar credentials, one-use OAuth states and distributed sync leases.
-- Forward-only: existing connections are preserved; no study records are rewritten.
create extension if not exists supabase_vault with schema vault;
create schema if not exists calendar_private;
revoke all on schema calendar_private from public, anon, authenticated;
grant usage on schema calendar_private to service_role;

alter table public.google_calendar_connections
  add column if not exists refresh_secret_id uuid references vault.secrets(id),
  add column if not exists access_secret_id uuid references vault.secrets(id),
  alter column refresh_token drop not null;

do $$
declare c record; r uuid; a uuid;
begin
  for c in select * from public.google_calendar_connections for update loop
    r := c.refresh_secret_id; a := c.access_secret_id;
    if r is null and nullif(c.refresh_token, '') is not null then
      r := vault.create_secret(c.refresh_token);
    end if;
    if a is null and nullif(c.access_token, '') is not null then
      a := vault.create_secret(c.access_token);
    end if;
    update public.google_calendar_connections set refresh_secret_id=r, access_secret_id=a,
      refresh_token=null, access_token=null where user_id=c.user_id;
  end loop;
end $$;

alter table public.google_calendar_connections
  add constraint calendar_tokens_not_plaintext check (refresh_token is null and access_token is null);
revoke all on public.google_calendar_connections from public, anon, authenticated;

create table calendar_private.oauth_nonces (
  nonce uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null, expires_at timestamptz not null
);
create index oauth_nonces_user_expiry on calendar_private.oauth_nonces(user_id, expires_at);
create index oauth_nonces_expiry on calendar_private.oauth_nonces(expires_at);
create table calendar_private.sync_leases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner uuid not null, expires_at timestamptz not null, started_at timestamptz not null
);
alter table calendar_private.oauth_nonces enable row level security;
alter table calendar_private.sync_leases enable row level security;
revoke all on all tables in schema calendar_private from public, anon, authenticated;

-- Private definers are reachable only through service-role invoker wrappers.
create function calendar_private.require_service() returns void
language plpgsql security invoker set search_path='' as $$
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise insufficient_privilege using message='service role required';
  end if;
end $$;

create function calendar_private.connection_read(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.google_calendar_connections%rowtype; r text; a text;
begin
  perform calendar_private.require_service();
  select * into c from public.google_calendar_connections where user_id=p_user_id;
  if not found then return null; end if;
  select decrypted_secret into r from vault.decrypted_secrets where id=c.refresh_secret_id;
  select decrypted_secret into a from vault.decrypted_secrets where id=c.access_secret_id;
  if r is null then raise exception 'Calendar credential unavailable'; end if;
  return jsonb_build_object('user_id',c.user_id,'calendar_id',c.calendar_id,'client_id',c.client_id,
    'refresh_token',r,'access_token',a,'access_token_expires_at',c.access_token_expires_at);
end $$;
create function public.calendar_connection_read(p_user_id uuid) returns jsonb
language sql security invoker set search_path='' as $$ select calendar_private.connection_read(p_user_id) $$;

create function calendar_private.connection_write(p_user_id uuid, p_tokens jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare c public.google_calendar_connections%rowtype; r uuid; a uuid;
begin
  perform calendar_private.require_service();
  if p_user_id is null or jsonb_typeof(p_tokens) <> 'object'
    or length(coalesce(p_tokens->>'refresh_token',''))>16384
    or length(coalesce(p_tokens->>'access_token',''))>16384
    or length(coalesce(p_tokens->>'client_id',''))>512 then raise exception 'Invalid Calendar credentials'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 746154));
  select * into c from public.google_calendar_connections where user_id=p_user_id for update;
  r := c.refresh_secret_id; a := c.access_secret_id;
  if nullif(p_tokens->>'refresh_token','') is not null then
    if r is null then r := vault.create_secret(p_tokens->>'refresh_token');
    else perform vault.update_secret(r,p_tokens->>'refresh_token'); end if;
  end if;
  if r is null then raise exception 'Calendar refresh credential required'; end if;
  if nullif(p_tokens->>'access_token','') is not null then
    if a is null then a := vault.create_secret(p_tokens->>'access_token');
    else perform vault.update_secret(a,p_tokens->>'access_token'); end if;
  end if;
  insert into public.google_calendar_connections(user_id,calendar_id,client_id,refresh_secret_id,access_secret_id,
    access_token_expires_at,scope,updated_at,sync_error)
  values(p_user_id,coalesce(c.calendar_id,'primary'),coalesce(nullif(p_tokens->>'client_id',''),c.client_id),r,a,
    coalesce((p_tokens->>'access_token_expires_at')::timestamptz,c.access_token_expires_at),
    coalesce(nullif(p_tokens->>'scope',''),c.scope,'https://www.googleapis.com/auth/calendar.events.readonly'),now(),null)
  on conflict(user_id) do update set client_id=excluded.client_id,refresh_secret_id=excluded.refresh_secret_id,
    access_secret_id=excluded.access_secret_id,access_token_expires_at=excluded.access_token_expires_at,
    scope=excluded.scope,updated_at=excluded.updated_at,sync_error=null;
end $$;
create function public.calendar_connection_write(p_user_id uuid,p_tokens jsonb) returns void
language sql security invoker set search_path='' as $$ select calendar_private.connection_write(p_user_id,p_tokens) $$;

create function calendar_private.connection_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from vault.secrets where id in (old.refresh_secret_id,old.access_secret_id);
  return old;
end $$;
create trigger calendar_connection_secret_cleanup after delete on public.google_calendar_connections
for each row execute function calendar_private.connection_cleanup();

create function calendar_private.nonce_issue(p_user_id uuid,p_nonce uuid,p_client_id text,p_expires_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform calendar_private.require_service();
  if p_expires_at<=now() or p_expires_at>now()+interval '16 minutes' or length(p_client_id)>512 then
    raise exception 'Invalid OAuth state'; end if;
  delete from calendar_private.oauth_nonces where expires_at<=now();
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 746155));
  if (select count(*) from calendar_private.oauth_nonces where user_id=p_user_id)>=10 then
    raise exception 'Too many pending authorization requests'; end if;
  insert into calendar_private.oauth_nonces values(p_nonce,p_user_id,p_client_id,p_expires_at);
end $$;
create function public.calendar_oauth_nonce_issue(p_user_id uuid,p_nonce uuid,p_client_id text,p_expires_at timestamptz) returns void
language sql security invoker set search_path='' as $$ select calendar_private.nonce_issue(p_user_id,p_nonce,p_client_id,p_expires_at) $$;
create function calendar_private.nonce_consume(p_user_id uuid,p_nonce uuid,p_client_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  perform calendar_private.require_service();
  delete from calendar_private.oauth_nonces where nonce=p_nonce and user_id=p_user_id
    and client_id=p_client_id and expires_at>now();
  return found;
end $$;
create function public.calendar_oauth_nonce_consume(p_user_id uuid,p_nonce uuid,p_client_id text) returns boolean
language sql security invoker set search_path='' as $$ select calendar_private.nonce_consume(p_user_id,p_nonce,p_client_id) $$;

create function calendar_private.sync_begin(p_user_id uuid,p_owner uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare l calendar_private.sync_leases%rowtype;
begin
  perform calendar_private.require_service();
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,746156));
  select * into l from calendar_private.sync_leases where user_id=p_user_id for update;
  if found and (l.expires_at>now() or l.started_at>now()-interval '30 seconds') then return false; end if;
  insert into calendar_private.sync_leases values(p_user_id,p_owner,now()+interval '5 minutes',now())
  on conflict(user_id) do update set owner=excluded.owner,expires_at=excluded.expires_at,started_at=excluded.started_at;
  return true;
end $$;
create function public.calendar_sync_begin(p_user_id uuid,p_owner uuid) returns boolean
language sql security invoker set search_path='' as $$ select calendar_private.sync_begin(p_user_id,p_owner) $$;
create function calendar_private.sync_end(p_user_id uuid,p_owner uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform calendar_private.require_service();
  update calendar_private.sync_leases set expires_at=now() where user_id=p_user_id and owner=p_owner;
end $$;
create function public.calendar_sync_end(p_user_id uuid,p_owner uuid) returns void
language sql security invoker set search_path='' as $$ select calendar_private.sync_end(p_user_id,p_owner) $$;

revoke all on all functions in schema calendar_private from public,anon,authenticated;
grant execute on all functions in schema calendar_private to service_role;
revoke all on function public.calendar_connection_read(uuid),public.calendar_connection_write(uuid,jsonb),
  public.calendar_oauth_nonce_issue(uuid,uuid,text,timestamptz),public.calendar_oauth_nonce_consume(uuid,uuid,text),
  public.calendar_sync_begin(uuid,uuid),public.calendar_sync_end(uuid,uuid) from public,anon,authenticated;
grant execute on function public.calendar_connection_read(uuid),public.calendar_connection_write(uuid,jsonb),
  public.calendar_oauth_nonce_issue(uuid,uuid,text,timestamptz),public.calendar_oauth_nonce_consume(uuid,uuid,text),
  public.calendar_sync_begin(uuid,uuid),public.calendar_sync_end(uuid,uuid) to service_role;

-- The current hourly workflow uses the authenticated Edge Function, not the legacy token RPC.
revoke execute on function public.sync_calendar_tasks(text,jsonb,date,date) from public,anon,authenticated;
grant execute on function public.sync_calendar_tasks(text,jsonb,date,date) to service_role;


notify pgrst, 'reload schema';
