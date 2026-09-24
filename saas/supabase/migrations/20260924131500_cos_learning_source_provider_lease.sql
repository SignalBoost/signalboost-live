-- Shared external-research provider lease/cooldown for COS University learning.
-- Prevents parallel COS/specialist/serverless lanes from bursting the same upstream provider.
-- This coordinates acquisition only; it does not authorize learning, weaken admission, or alter rights.

create table if not exists public.cos_learning_source_provider_leases (
  provider_id text primary key,
  lease_id uuid,
  holder text,
  leased_until timestamptz,
  not_before timestamptz not null default '-infinity'::timestamptz,
  last_outcome text,
  last_error text,
  updated_at timestamptz not null default clock_timestamp(),
  constraint cos_learning_source_provider_leases_provider_id_chk
    check (provider_id ~ '^[a-z0-9_:-]{1,120}$'),
  constraint cos_learning_source_provider_leases_outcome_chk
    check (last_outcome is null or last_outcome in ('ok','error','rate_limited','timeout'))
);

alter table public.cos_learning_source_provider_leases enable row level security;

revoke all on table public.cos_learning_source_provider_leases
  from public, anon, authenticated, service_role;

create or replace function public.claim_cos_learning_source_provider_lease(
  p_provider_id text,
  p_lease_id uuid,
  p_holder text,
  p_ttl_seconds integer default 30
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.cos_learning_source_provider_leases%rowtype;
  v_ttl integer := greatest(5, least(120, coalesce(p_ttl_seconds, 30)));
begin
  if p_provider_id is null or p_provider_id !~ '^[a-z0-9_:-]{1,120}$' then
    raise exception 'invalid_learning_provider_id';
  end if;
  if p_lease_id is null then
    raise exception 'learning_provider_lease_id_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cos-learning-provider:' || p_provider_id, 0));

  insert into public.cos_learning_source_provider_leases(provider_id, updated_at)
  values (p_provider_id, v_now)
  on conflict (provider_id) do nothing;

  select * into v_row
  from public.cos_learning_source_provider_leases
  where provider_id = p_provider_id
  for update;

  if coalesce(v_row.leased_until, '-infinity'::timestamptz) > v_now
    or coalesce(v_row.not_before, '-infinity'::timestamptz) > v_now then
    return false;
  end if;

  update public.cos_learning_source_provider_leases
  set lease_id = p_lease_id,
      holder = left(coalesce(p_holder, 'unknown'), 160),
      leased_until = v_now + make_interval(secs => v_ttl),
      updated_at = v_now
  where provider_id = p_provider_id;

  return true;
end;
$$;

create or replace function public.release_cos_learning_source_provider_lease(
  p_provider_id text,
  p_lease_id uuid,
  p_outcome text,
  p_cooldown_seconds integer default 0,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cooldown integer := greatest(0, least(3600, coalesce(p_cooldown_seconds, 0)));
  v_rows integer := 0;
begin
  if p_provider_id is null or p_provider_id !~ '^[a-z0-9_:-]{1,120}$' then
    raise exception 'invalid_learning_provider_id';
  end if;
  if p_lease_id is null then
    raise exception 'learning_provider_lease_id_required';
  end if;
  if p_outcome not in ('ok','error','rate_limited','timeout') then
    raise exception 'invalid_learning_provider_outcome';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cos-learning-provider:' || p_provider_id, 0));

  update public.cos_learning_source_provider_leases
  set lease_id = null,
      holder = null,
      leased_until = null,
      not_before = greatest(
        coalesce(not_before, '-infinity'::timestamptz),
        v_now + make_interval(secs => v_cooldown)
      ),
      last_outcome = p_outcome,
      last_error = case when p_error is null then null else left(p_error, 500) end,
      updated_at = v_now
  where provider_id = p_provider_id
    and lease_id = p_lease_id;

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.claim_cos_learning_source_provider_lease(text, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.release_cos_learning_source_provider_lease(text, uuid, text, integer, text)
  from public, anon, authenticated;

grant execute on function public.claim_cos_learning_source_provider_lease(text, uuid, text, integer) to service_role;
grant execute on function public.release_cos_learning_source_provider_lease(text, uuid, text, integer, text) to service_role;
