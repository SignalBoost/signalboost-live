-- Prevent overlapping COS University mass-distillation control loops.
create table if not exists public.cos_university_mass_distillation_workflow_leases (
  scope text primary key,
  owner_token uuid not null,
  acquired_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null,
  constraint cos_university_mass_distillation_workflow_leases_scope_check check (scope = 'mass_distillation_control_loop'),
  constraint cos_university_mass_distillation_workflow_leases_time_check check (expires_at > acquired_at)
);
alter table public.cos_university_mass_distillation_workflow_leases enable row level security;
revoke all on table public.cos_university_mass_distillation_workflow_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.cos_university_mass_distillation_workflow_leases to service_role;

create or replace function public.claim_cos_university_mass_distillation_workflow_lease(p_owner uuid, p_ttl_seconds integer default 330)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_ttl integer := greatest(60, least(coalesce(p_ttl_seconds,330), 360));
  v_expires timestamptz;
  v_acquired boolean := false;
  v_current_owner uuid;
  v_current_expires timestamptz;
begin
  if p_owner is null then raise exception 'mass_distillation_workflow_lease_owner_required'; end if;
  v_expires := v_now + make_interval(secs => v_ttl);
  insert into public.cos_university_mass_distillation_workflow_leases(scope,owner_token,acquired_at,expires_at,updated_at)
  values ('mass_distillation_control_loop',p_owner,v_now,v_expires,v_now)
  on conflict (scope) do update
    set owner_token=excluded.owner_token, acquired_at=excluded.acquired_at, expires_at=excluded.expires_at, updated_at=excluded.updated_at
    where public.cos_university_mass_distillation_workflow_leases.expires_at <= v_now
       or public.cos_university_mass_distillation_workflow_leases.owner_token = p_owner
  returning true,owner_token,expires_at into v_acquired,v_current_owner,v_current_expires;
  if coalesce(v_acquired,false) then
    return jsonb_build_object('acquired',true,'ownerToken',p_owner,'expiresAt',v_current_expires,'ttlSeconds',v_ttl);
  end if;
  select owner_token,expires_at into v_current_owner,v_current_expires
  from public.cos_university_mass_distillation_workflow_leases where scope='mass_distillation_control_loop';
  return jsonb_build_object('acquired',false,'ownerToken',v_current_owner,'expiresAt',v_current_expires,'ttlSeconds',v_ttl);
end; $$;

create or replace function public.release_cos_university_mass_distillation_workflow_lease(p_owner uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_owner is null then return false; end if;
  delete from public.cos_university_mass_distillation_workflow_leases
  where scope='mass_distillation_control_loop' and owner_token=p_owner;
  return found;
end; $$;

revoke all on function public.claim_cos_university_mass_distillation_workflow_lease(uuid,integer) from public, anon, authenticated;
revoke all on function public.release_cos_university_mass_distillation_workflow_lease(uuid) from public, anon, authenticated;
grant execute on function public.claim_cos_university_mass_distillation_workflow_lease(uuid,integer) to service_role;
grant execute on function public.release_cos_university_mass_distillation_workflow_lease(uuid) to service_role;
