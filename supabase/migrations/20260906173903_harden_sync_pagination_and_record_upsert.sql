-- Forward migration for existing projects: indexes support the keyset readers,
-- and ON CONFLICT turns concurrent first writes into the normal RPC response.

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
    create unique index if not exists study_records_user_date_unique_idx
      on public.study_records (user_id, study_date);
  end if;
end;
$$;

create index if not exists study_records_user_updated_date_idx
  on public.study_records (user_id, updated_at, study_date);

create index if not exists calendar_tasks_user_date_key_idx
  on public.calendar_tasks (user_id, event_date, event_key);

create index if not exists calendar_tasks_user_calendar_key_idx
  on public.calendar_tasks (user_id, calendar_id, event_key);

alter table public.study_records enable row level security;

drop policy if exists "Users can read own study records" on public.study_records;
drop policy if exists "Users can insert own study records" on public.study_records;
drop policy if exists "Users can update own study records" on public.study_records;
drop policy if exists "Users can delete own study records" on public.study_records;
drop policy if exists study_records_select_own on public.study_records;
drop policy if exists study_records_insert_own on public.study_records;
drop policy if exists study_records_update_own on public.study_records;

create policy study_records_select_own
  on public.study_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy study_records_insert_own
  on public.study_records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy study_records_update_own
  on public.study_records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.study_records from anon, authenticated;
grant select, insert, update on table public.study_records to authenticated;

alter table public.calendar_tasks enable row level security;
drop policy if exists "Users can read own calendar tasks" on public.calendar_tasks;
drop policy if exists calendar_tasks_select_own on public.calendar_tasks;
create policy calendar_tasks_select_own
  on public.calendar_tasks for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.calendar_tasks from anon, authenticated;
grant select on table public.calendar_tasks to authenticated;

alter table public.google_calendar_connections enable row level security;
revoke all on table public.google_calendar_connections from anon, authenticated;

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

    insert into public.study_records as sr(
      user_id,
      study_date,
      payload,
      revision,
      updated_at
    )
    values (
      v_uid,
      p_study_date,
      coalesce(p_payload, '{}'::jsonb),
      1,
      now()
    )
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

revoke execute on function public.upsert_study_record(date, jsonb, bigint)
  from public, anon;
grant execute on function public.upsert_study_record(date, jsonb, bigint)
  to authenticated;
