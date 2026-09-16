-- v171 schema for revision-based study sync and server-side Google Calendar
-- storage. It is idempotent so it can also repair a partially created project.

create table if not exists public.study_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  revision bigint not null default 1,
  primary key (user_id, study_date)
);

alter table public.study_records
  add column if not exists revision bigint not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.study_records'::regclass
      and contype in ('p', 'u')
      and pg_get_constraintdef(oid) in (
        'PRIMARY KEY (user_id, study_date)',
        'UNIQUE (user_id, study_date)'
      )
  ) then
    alter table public.study_records
      add constraint study_records_user_date_key unique (user_id, study_date);
  end if;
end;
$$;

create index if not exists study_records_user_updated_date_idx
  on public.study_records (user_id, updated_at, study_date);

alter table public.study_records enable row level security;

drop policy if exists study_records_select_own on public.study_records;
create policy study_records_select_own
  on public.study_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists study_records_insert_own on public.study_records;
create policy study_records_insert_own
  on public.study_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists study_records_update_own on public.study_records;
create policy study_records_update_own
  on public.study_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.study_records from anon, authenticated;
grant select, insert, update on table public.study_records to authenticated;

create or replace function public.upsert_study_record(
  p_study_date date,
  p_payload jsonb,
  p_base_revision bigint default null
)
returns table(
  applied boolean,
  revision bigint,
  payload jsonb,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.study_records%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select sr.* into v_row
  from public.study_records as sr
  where sr.user_id = v_uid
    and sr.study_date = p_study_date
  for update;

  if not found then
    if coalesce(p_base_revision, 0) <> 0 then
      return query select false, null::bigint, null::jsonb, null::timestamptz;
      return;
    end if;

    insert into public.study_records as sr(user_id, study_date, payload, revision, updated_at)
    values (v_uid, p_study_date, coalesce(p_payload, '{}'::jsonb), 1, now())
    on conflict (user_id, study_date) do nothing
    returning sr.* into v_row;

    if found then
      return query select true, v_row.revision, v_row.payload, v_row.updated_at;
      return;
    end if;

    select sr.* into v_row
    from public.study_records as sr
    where sr.user_id = v_uid
      and sr.study_date = p_study_date
    for update;

    if not found then
      return query select false, null::bigint, null::jsonb, null::timestamptz;
      return;
    end if;

    if v_row.payload = coalesce(p_payload, '{}'::jsonb) then
      return query select true, v_row.revision, v_row.payload, v_row.updated_at;
      return;
    end if;

    return query select false, v_row.revision, v_row.payload, v_row.updated_at;
    return;
  end if;

  if v_row.payload = coalesce(p_payload, '{}'::jsonb) then
    return query select true, v_row.revision, v_row.payload, v_row.updated_at;
    return;
  end if;

  if p_base_revision is null or p_base_revision <> v_row.revision then
    return query select false, v_row.revision, v_row.payload, v_row.updated_at;
    return;
  end if;

  update public.study_records as sr
  set payload = coalesce(p_payload, '{}'::jsonb),
      revision = sr.revision + 1,
      updated_at = now()
  where sr.user_id = v_uid
    and sr.study_date = p_study_date
  returning sr.* into v_row;

  return query select true, v_row.revision, v_row.payload, v_row.updated_at;
end;
$$;

revoke execute on function public.upsert_study_record(date, jsonb, bigint) from public, anon;
grant execute on function public.upsert_study_record(date, jsonb, bigint) to authenticated;

create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  calendar_id text not null default 'primary',
  client_id text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  scope text not null default 'https://www.googleapis.com/auth/calendar.readonly',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  sync_error text
);

alter table public.google_calendar_connections
  add column if not exists client_id text;

alter table public.google_calendar_connections enable row level security;
revoke all on table public.google_calendar_connections from anon, authenticated;

create table if not exists public.calendar_tasks (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  source_event_id text not null,
  calendar_id text not null default 'primary',
  event_date date not null,
  end_date date,
  start_at timestamptz,
  end_at timestamptz,
  is_all_day boolean not null default true,
  title text not null,
  description text not null default '',
  location text not null default '',
  category text not null default 'other',
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  event_updated_at timestamptz,
  primary key (user_id, event_key)
);

alter table public.calendar_tasks
  add column if not exists event_updated_at timestamptz;

create index if not exists calendar_tasks_user_date_key_idx
  on public.calendar_tasks (user_id, event_date, event_key);

create index if not exists calendar_tasks_user_calendar_key_idx
  on public.calendar_tasks (user_id, calendar_id, event_key);

alter table public.calendar_tasks enable row level security;
drop policy if exists "Users can read own calendar tasks" on public.calendar_tasks;
create policy "Users can read own calendar tasks"
  on public.calendar_tasks for select
  to authenticated
  using (auth.uid() = user_id);

grant select on table public.calendar_tasks to authenticated;
