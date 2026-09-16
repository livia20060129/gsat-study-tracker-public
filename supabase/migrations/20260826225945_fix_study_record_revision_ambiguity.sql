-- Fix PL/pgSQL name resolution when OUT parameters share names with table
-- columns. Qualifying the target relation keeps revision increments atomic.
-- This replacement is idempotent and preserves the RPC response contract.

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
