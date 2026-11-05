-- Only the verified server-side translation handler can reserve this quota.
create table public.cloud_translation_usage (
  usage_day date not null,
  scope text not null,
  user_id uuid references auth.users(id) on delete cascade,
  characters bigint not null default 0 check (characters >= 0),
  requests integer not null default 0 check (requests >= 0),
  primary key (usage_day, scope),
  check ((scope = 'global' and user_id is null) or (user_id is not null and scope = 'user:' || user_id::text))
);
alter table public.cloud_translation_usage enable row level security;
create index cloud_translation_usage_user_id_idx on public.cloud_translation_usage (user_id) where user_id is not null;
revoke all on public.cloud_translation_usage from public, anon, authenticated;
grant select, insert, update, delete on public.cloud_translation_usage to service_role;

create function public.reserve_cloud_translation_usage(p_user_id uuid, p_characters integer, p_user_limit integer, p_global_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (transaction_timestamp() at time zone 'UTC')::date;
  user_scope text := 'user:' || p_user_id::text;
  total_chars bigint;
  total_requests integer;
  user_chars bigint;
  user_requests integer;
begin
  if p_user_id is null or p_characters is null or p_characters < 1 or p_characters > 2000
    or p_user_limit is null or p_user_limit < 0 or p_user_limit > 5000000
    or p_global_limit is null or p_global_limit < 0 or p_global_limit > 5000000 then
    return false;
  end if;
  -- A day-wide transaction lock makes the user and global reservations atomic across isolates.
  perform pg_catalog.pg_advisory_xact_lock(2147483201, today - date '2020-01-01');
  delete from public.cloud_translation_usage where usage_day < today - 35;
  insert into public.cloud_translation_usage (usage_day, scope) values (today, 'global') on conflict do nothing;
  select characters, requests into total_chars, total_requests from public.cloud_translation_usage
    where usage_day = today and scope = 'global' for update;
  select coalesce((select characters from public.cloud_translation_usage where usage_day = today and scope = user_scope), 0),
         coalesce((select requests from public.cloud_translation_usage where usage_day = today and scope = user_scope), 0)
    into user_chars, user_requests;
  if total_chars + p_characters > p_global_limit or user_chars + p_characters > p_user_limit
    or total_requests >= 2000 or user_requests >= 100 then
    return false;
  end if;
  insert into public.cloud_translation_usage (usage_day, scope, user_id, characters, requests)
    values (today, user_scope, p_user_id, p_characters, 1)
    on conflict (usage_day, scope) do update set characters = cloud_translation_usage.characters + p_characters,
      requests = cloud_translation_usage.requests + 1;
  update public.cloud_translation_usage set characters = characters + p_characters, requests = requests + 1
    where usage_day = today and scope = 'global';
  return true;
end;
$$;
revoke all on function public.reserve_cloud_translation_usage(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_cloud_translation_usage(uuid, integer, integer, integer) to service_role;
