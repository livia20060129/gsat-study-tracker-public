-- Canonical base schema. The filename matches the migration already recorded
-- in production, so a fresh clone and the live project share one history.

create table if not exists public.study_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  study_date date not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, study_date)
);

create index if not exists study_records_updated_at_idx
  on public.study_records (updated_at desc);

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
