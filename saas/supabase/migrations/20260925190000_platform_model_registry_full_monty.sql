-- Platform-wide durable buyer model registry, encrypted credential vault references,
-- governed assignment history, and atomic switch/rollback functions.
-- Secrets are encrypted by the host before this schema receives them.
create extension if not exists pgcrypto;

create table if not exists public.platform_model_profiles (
  profile_key text primary key check (profile_key ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  profile jsonb not null,
  enabled boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_model_credentials (
  credential_ref text primary key check (credential_ref ~ '^model-vault:[0-9a-f-]{36}$'),
  profile_key text not null references public.platform_model_profiles(profile_key) on delete cascade,
  secret_name text not null check (secret_name ~ '^[A-Za-z0-9_.-]{1,80}$'),
  value_encrypted text not null,
  iv text not null,
  tag text not null,
  last4 text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_model_transports (
  profile_key text not null references public.platform_model_profiles(profile_key) on delete cascade,
  protocol text not null check (protocol in ('openai_compatible','anthropic_messages','google_generate_content','native_sdk','local_runtime','custom_http')),
  provider text not null,
  endpoint text,
  credential_ref text references public.platform_model_credentials(credential_ref) on delete set null,
  api_version text,
  timeout_ms integer not null check (timeout_ms between 1000 and 300000),
  max_call_cost_usd numeric(12,6) not null default 0 check (max_call_cost_usd >= 0 and max_call_cost_usd <= 10000),
  enabled boolean not null default true,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (profile_key, protocol)
);

create table if not exists public.platform_model_assignments (
  assignment_id uuid primary key default gen_random_uuid(),
  use text not null check (use in ('cos_reasoner','builder','specialist')),
  profile_key text not null references public.platform_model_profiles(profile_key),
  previous_assignment_id uuid references public.platform_model_assignments(assignment_id),
  certification_event_id text not null,
  status text not null check (status in ('active','superseded','rolled_back')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists platform_model_assignments_one_active_per_use
  on public.platform_model_assignments(use) where status = 'active';
create index if not exists platform_model_assignments_history_idx
  on public.platform_model_assignments(use, created_at desc);
create index if not exists platform_model_transports_profile_idx
  on public.platform_model_transports(profile_key) where enabled = true;

alter table public.platform_model_profiles enable row level security;
alter table public.platform_model_credentials enable row level security;
alter table public.platform_model_transports enable row level security;
alter table public.platform_model_assignments enable row level security;

revoke all on public.platform_model_profiles from anon, authenticated;
revoke all on public.platform_model_credentials from anon, authenticated;
revoke all on public.platform_model_transports from anon, authenticated;
revoke all on public.platform_model_assignments from anon, authenticated;

create or replace function public.platform_register_model(
  p_profile jsonb,
  p_binding jsonb,
  p_actor text,
  p_credential_ref text default null,
  p_secret_name text default null,
  p_value_encrypted text default null,
  p_iv text default null,
  p_tag text default null,
  p_last4 text default null
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_key text := lower(trim(coalesce(p_profile->>'key','')));
  v_protocol text := trim(coalesce(p_binding->>'protocol',''));
  v_existing_ref text;
  v_ref text;
begin
  if v_profile_key !~ '^[a-z0-9][a-z0-9._-]{1,119}$' then raise exception 'platform_model_profile_key_invalid'; end if;
  if v_protocol not in ('openai_compatible','anthropic_messages','google_generate_content','native_sdk','local_runtime','custom_http') then raise exception 'platform_model_transport_protocol_invalid'; end if;
  if trim(coalesce(p_actor,'')) = '' then raise exception 'platform_model_actor_required'; end if;

  insert into public.platform_model_profiles(profile_key,profile,enabled,created_by,updated_at)
  values (v_profile_key,p_profile,true,p_actor,now())
  on conflict(profile_key) do update set profile=excluded.profile, enabled=true, updated_at=now();

  select credential_ref into v_existing_ref
    from public.platform_model_transports where profile_key=v_profile_key and protocol=v_protocol;
  v_ref := nullif(trim(coalesce(p_credential_ref,'')),'');

  if v_ref is not null then
    if p_value_encrypted is null or p_iv is null or p_tag is null or nullif(trim(coalesce(p_secret_name,'')),'') is null then
      raise exception 'platform_model_encrypted_credential_incomplete';
    end if;
    insert into public.platform_model_credentials(
      credential_ref,profile_key,secret_name,value_encrypted,iv,tag,last4,created_by,updated_at
    ) values (
      v_ref,v_profile_key,p_secret_name,p_value_encrypted,p_iv,p_tag,coalesce(p_last4,''),p_actor,now()
    )
    on conflict(credential_ref) do update set
      value_encrypted=excluded.value_encrypted,iv=excluded.iv,tag=excluded.tag,last4=excluded.last4,updated_at=now();
  else
    v_ref := v_existing_ref;
  end if;

  insert into public.platform_model_transports(
    profile_key,protocol,provider,endpoint,credential_ref,api_version,timeout_ms,max_call_cost_usd,enabled,created_by,updated_at
  ) values (
    v_profile_key,
    v_protocol,
    trim(coalesce(p_binding->>'provider','')),
    nullif(trim(coalesce(p_binding->>'endpoint','')),''),
    v_ref,
    nullif(trim(coalesce(p_binding->>'apiVersion','')),''),
    greatest(1000,least(300000,coalesce((p_binding->>'timeoutMs')::integer,120000))),
    greatest(0,least(10000,coalesce((p_binding->>'maxCallCostUsd')::numeric,0))),
    true,p_actor,now()
  )
  on conflict(profile_key,protocol) do update set
    provider=excluded.provider,endpoint=excluded.endpoint,credential_ref=excluded.credential_ref,
    api_version=excluded.api_version,timeout_ms=excluded.timeout_ms,max_call_cost_usd=excluded.max_call_cost_usd,
    enabled=true,updated_at=now();

  if v_existing_ref is not null and v_ref is distinct from v_existing_ref then
    delete from public.platform_model_credentials where credential_ref=v_existing_ref;
  end if;

  return v_profile_key;
end $$;

create or replace function public.platform_set_model_assignment(
  p_use text,
  p_profile_key text,
  p_certification_event_id text,
  p_actor text,
  p_expected_current_assignment_id uuid default null
) returns public.platform_model_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.platform_model_assignments%rowtype;
  v_next public.platform_model_assignments%rowtype;
  v_profile jsonb;
begin
  if p_use not in ('cos_reasoner','builder','specialist') then raise exception 'platform_model_assignment_use_invalid'; end if;
  if trim(coalesce(p_actor,''))='' then raise exception 'platform_model_actor_required'; end if;
  if trim(coalesce(p_certification_event_id,''))='' then raise exception 'platform_model_certification_required'; end if;

  select profile into v_profile from public.platform_model_profiles
    where profile_key=p_profile_key and enabled=true for update;
  if v_profile is null then raise exception 'platform_model_assignment_profile_unavailable'; end if;
  if not (v_profile->'uses' ? p_use) then raise exception 'platform_model_assignment_use_not_registered'; end if;

  select * into v_current from public.platform_model_assignments
    where use=p_use and status='active' for update;
  if p_expected_current_assignment_id is not null
     and (v_current.assignment_id is null or v_current.assignment_id <> p_expected_current_assignment_id) then
    raise exception 'platform_model_assignment_conflict';
  end if;
  if v_current.assignment_id is not null and v_current.profile_key=p_profile_key then
    raise exception 'platform_model_assignment_already_active';
  end if;

  if v_current.assignment_id is not null then
    update public.platform_model_assignments set status='superseded'
      where assignment_id=v_current.assignment_id;
  end if;

  insert into public.platform_model_assignments(
    use,profile_key,previous_assignment_id,certification_event_id,status,created_by
  ) values (
    p_use,p_profile_key,v_current.assignment_id,p_certification_event_id,'active',p_actor
  ) returning * into v_next;
  return v_next;
end $$;

create or replace function public.platform_rollback_model_assignment(
  p_use text,
  p_actor text,
  p_expected_current_assignment_id uuid
) returns public.platform_model_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.platform_model_assignments%rowtype;
  v_previous public.platform_model_assignments%rowtype;
  v_next public.platform_model_assignments%rowtype;
begin
  if p_use not in ('cos_reasoner','builder','specialist') then raise exception 'platform_model_assignment_use_invalid'; end if;
  select * into v_current from public.platform_model_assignments
    where use=p_use and status='active' for update;
  if v_current.assignment_id is null or v_current.assignment_id <> p_expected_current_assignment_id then
    raise exception 'platform_model_assignment_conflict';
  end if;
  if v_current.previous_assignment_id is null then raise exception 'platform_model_assignment_no_rollback_target'; end if;
  select * into v_previous from public.platform_model_assignments
    where assignment_id=v_current.previous_assignment_id;
  if v_previous.assignment_id is null then raise exception 'platform_model_assignment_rollback_target_missing'; end if;

  update public.platform_model_assignments set status='rolled_back'
    where assignment_id=v_current.assignment_id;
  insert into public.platform_model_assignments(
    use,profile_key,previous_assignment_id,certification_event_id,status,created_by
  ) values (
    p_use,v_previous.profile_key,v_current.assignment_id,v_previous.certification_event_id,'active',p_actor
  ) returning * into v_next;
  return v_next;
end $$;

create or replace function public.platform_disable_model(p_profile_key text,p_actor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists(select 1 from public.platform_model_assignments where profile_key=p_profile_key and status='active') then
    raise exception 'platform_model_disable_active_assignment';
  end if;
  update public.platform_model_profiles set enabled=false,updated_at=now() where profile_key=p_profile_key;
  update public.platform_model_transports set enabled=false,updated_at=now() where profile_key=p_profile_key;
end $$;

revoke all on function public.platform_register_model(jsonb,jsonb,text,text,text,text,text,text,text) from public, anon, authenticated;
revoke all on function public.platform_set_model_assignment(text,text,text,text,uuid) from public, anon, authenticated;
revoke all on function public.platform_rollback_model_assignment(text,text,uuid) from public, anon, authenticated;
revoke all on function public.platform_disable_model(text,text) from public, anon, authenticated;

comment on table public.platform_model_credentials is 'Encrypted model-provider credentials only. Plaintext must never be persisted.';
comment on table public.platform_model_assignments is 'Governed append-style model routing history. Certification evidence never activates a model by itself.';
