-- Monthly account counters are independent of browser storage and daily global limits.
create table public.cloud_translation_monthly_usage (
  usage_month date not null check (extract(day from usage_month) = 1),
  user_id uuid not null references auth.users(id) on delete cascade,
  characters bigint not null default 0 check (characters >= 0),
  requests bigint not null default 0 check (requests >= 0),
  primary key (usage_month, user_id)
);
alter table public.cloud_translation_monthly_usage enable row level security;
create index cloud_translation_monthly_usage_user_id_idx on public.cloud_translation_monthly_usage (user_id);
revoke all on public.cloud_translation_monthly_usage from public, anon, authenticated;
grant select, insert, update, delete on public.cloud_translation_monthly_usage to service_role;

-- Carry forward legacy reservations, including the prior UTC date at Taiwan's month boundary.
insert into public.cloud_translation_monthly_usage (usage_month, user_id, characters, requests)
select date_trunc('month', transaction_timestamp() at time zone 'Asia/Taipei')::date,
       user_id, sum(characters), sum(requests)
from public.cloud_translation_usage
where user_id is not null
  and usage_day >= date_trunc('month', transaction_timestamp() at time zone 'Asia/Taipei')::date - 1
group by user_id;

create or replace function public.reserve_cloud_translation_usage(p_user_id uuid, p_characters integer, p_user_limit integer, p_global_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  today date := (transaction_timestamp() at time zone 'UTC')::date;
  this_month date := date_trunc('month', transaction_timestamp() at time zone 'Asia/Taipei')::date;
  user_scope text := 'user:' || p_user_id::text;
  monthly_limit integer := least(p_user_limit, 5000);
  total_chars bigint;
  total_requests integer;
  month_chars bigint;
begin
  if p_user_id is null or p_characters is null or p_characters < 1 or p_characters > 2000
    or p_user_limit is null or p_user_limit < 0 or p_user_limit > 5000000
    or p_global_limit is null or p_global_limit < 0 or p_global_limit > 5000000 then
    return false;
  end if;
  -- Month-wide identity lock also covers the UTC-day boundary inside one Taiwan month.
  perform pg_catalog.pg_advisory_xact_lock(2147483202, pg_catalog.hashtext(p_user_id::text || ':' || this_month::text));
  perform pg_catalog.pg_advisory_xact_lock(2147483201, today - date '2020-01-01');
  delete from public.cloud_translation_usage where usage_day < today - 35;
  delete from public.cloud_translation_monthly_usage where usage_month < this_month;
  insert into public.cloud_translation_usage (usage_day, scope) values (today, 'global') on conflict do nothing;
  select characters, requests into total_chars, total_requests from public.cloud_translation_usage
    where usage_day = today and scope = 'global' for update;
  select coalesce((select characters from public.cloud_translation_monthly_usage where usage_month = this_month and user_id = p_user_id), 0)
    into month_chars;
  if total_chars + p_characters > p_global_limit or month_chars + p_characters > monthly_limit
    or total_requests >= 2000 then
    return false;
  end if;
  insert into public.cloud_translation_monthly_usage (usage_month, user_id, characters, requests)
    values (this_month, p_user_id, p_characters, 1)
    on conflict (usage_month, user_id) do update set characters = cloud_translation_monthly_usage.characters + p_characters,
      requests = cloud_translation_monthly_usage.requests + 1;
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
