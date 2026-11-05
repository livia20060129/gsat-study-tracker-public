-- A reservation receipt prevents a retried service-side RPC from charging twice.
-- No input text, translations, tokens or Google credentials are stored here.
create schema if not exists private;
grant usage on schema private to service_role;
create table private.cloud_translation_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  characters integer not null check (characters between 1 and 2000),
  quota jsonb not null,
  created_at timestamptz not null default transaction_timestamp(),
  primary key (user_id, request_id)
);
alter table private.cloud_translation_requests enable row level security;
revoke all on private.cloud_translation_requests from public, anon, authenticated;
grant select, insert, delete on private.cloud_translation_requests to service_role;
create index cloud_translation_requests_created_at_idx on private.cloud_translation_requests (created_at);

create function public.reserve_cloud_translation_request(
  p_user_id uuid, p_request_id uuid, p_characters integer, p_user_limit integer, p_global_limit integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  receipt private.cloud_translation_requests%rowtype;
  this_month date := date_trunc('month', transaction_timestamp() at time zone 'Asia/Taipei')::date;
  monthly_limit integer := least(p_user_limit, 5000);
  permitted boolean;
  used_chars bigint;
  result jsonb;
begin
  if p_user_id is null or p_request_id is null or p_characters is null
    or p_characters < 1 or p_characters > 2000 or p_user_limit is null
    or p_user_limit < 0 or p_user_limit > 5000000 or p_global_limit is null
    or p_global_limit < 0 or p_global_limit > 5000000 then
    raise exception 'Invalid quota request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(2147483203, pg_catalog.hashtext(p_user_id::text || ':' || p_request_id::text));
  select * into receipt from private.cloud_translation_requests
    where user_id = p_user_id and request_id = p_request_id;
  if found then
    if receipt.characters <> p_characters then raise exception 'Reservation mismatch'; end if;
    return receipt.quota;
  end if;
  -- Keep the month lock until both the counter and its returned snapshot are committed.
  perform pg_catalog.pg_advisory_xact_lock(2147483202, pg_catalog.hashtext(p_user_id::text || ':' || this_month::text));
  permitted := public.reserve_cloud_translation_usage(p_user_id, p_characters, p_user_limit, p_global_limit);
  select coalesce((select characters from public.cloud_translation_monthly_usage
    where usage_month = this_month and user_id = p_user_id), 0) into used_chars;
  result := pg_catalog.jsonb_build_object('allowed', permitted, 'used', used_chars,
    'remaining', greatest(0, monthly_limit - used_chars), 'limit', monthly_limit,
    'resetsAt', to_char(this_month + interval '1 month', 'YYYY-MM-DD') || 'T00:00:00+08:00');
  insert into private.cloud_translation_requests (user_id, request_id, characters, quota)
    values (p_user_id, p_request_id, p_characters, result);
  delete from private.cloud_translation_requests where created_at < transaction_timestamp() - interval '35 days';
  return result;
end;
$$;
revoke all on function public.reserve_cloud_translation_request(uuid, uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_cloud_translation_request(uuid, uuid, integer, integer, integer) to service_role;
