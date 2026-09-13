-- Specialist Mesh Phase 5: provider-specific idempotency + durable reconciliation proof.
-- Non-advisory failover is permitted only after a provider adapter produces durable evidence that
-- the prior side effect was either applied already or definitely not applied. Unknown stays fail-closed.

create table if not exists public.a2a_specialist_mesh_write_recovery_attempts (
  attempt_key text primary key,
  operation_key text not null,
  work_item_id text not null references public.supervisor_work_items(work_item_id) on delete cascade,
  tenant_id text not null,
  environment_id text not null,
  portable_id text not null,
  task_id text not null,
  skill_id text not null,
  risk text not null check (risk in ('write', 'consequential')),
  agent_id text not null,
  fencing_token integer not null check (fencing_token > 0),
  provider_id text not null,
  idempotency_key text not null,
  status text not null default 'prepared' check (status in ('prepared', 'applied', 'not_applied', 'unknown')),
  provider_evidence_ref text,
  provider_operation_ref text,
  created_at timestamptz not null default now(),
  reconciled_at timestamptz,
  constraint a2a_specialist_mesh_write_recovery_scope_nonempty check (
    length(trim(attempt_key)) > 0 and length(trim(operation_key)) > 0 and
    length(trim(work_item_id)) > 0 and length(trim(tenant_id)) > 0 and
    length(trim(environment_id)) > 0 and length(trim(portable_id)) > 0 and
    length(trim(task_id)) > 0 and length(trim(skill_id)) > 0 and
    length(trim(agent_id)) > 0 and length(trim(provider_id)) > 0 and
    length(trim(idempotency_key)) > 0
  ),
  constraint a2a_specialist_mesh_write_recovery_work_item_match check (
    work_item_id = 'specialist-mesh:' || task_id
  ),
  constraint a2a_specialist_mesh_write_recovery_terminal_proof check (
    (status = 'prepared' and provider_evidence_ref is null and reconciled_at is null) or
    (status <> 'prepared' and provider_evidence_ref is not null and length(trim(provider_evidence_ref)) > 0 and reconciled_at is not null)
  )
);

create index if not exists a2a_specialist_mesh_write_recovery_operation_idx
  on public.a2a_specialist_mesh_write_recovery_attempts (operation_key, created_at desc);
create index if not exists a2a_specialist_mesh_write_recovery_provider_key_idx
  on public.a2a_specialist_mesh_write_recovery_attempts (provider_id, idempotency_key);

alter table public.a2a_specialist_mesh_write_recovery_attempts enable row level security;
revoke all on table public.a2a_specialist_mesh_write_recovery_attempts from public, anon, authenticated, service_role;

comment on table public.a2a_specialist_mesh_write_recovery_attempts is
  'Service-role RPC-only Specialist Mesh write/consequential recovery evidence. Every prepare/reconcile mutation is fenced by the exact Supervisor lease.';

create or replace function public.a2a_specialist_mesh_write_recovery_prepare(
  p_attempt_key text,
  p_operation_key text,
  p_work_item_id text,
  p_tenant_id text,
  p_environment_id text,
  p_portable_id text,
  p_task_id text,
  p_skill_id text,
  p_risk text,
  p_agent_id text,
  p_lease_id text,
  p_owner_instance_id text,
  p_owner_runtime_id text,
  p_fencing_token integer,
  p_provider_id text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.a2a_specialist_mesh_write_recovery_attempts%rowtype;
begin
  if p_attempt_key is null or trim(p_attempt_key) = '' or
     p_operation_key is null or trim(p_operation_key) = '' or
     p_work_item_id is null or trim(p_work_item_id) = '' or
     p_tenant_id is null or trim(p_tenant_id) = '' or
     p_environment_id is null or trim(p_environment_id) = '' or
     p_portable_id is null or trim(p_portable_id) = '' or
     p_task_id is null or trim(p_task_id) = '' or
     p_skill_id is null or trim(p_skill_id) = '' or
     p_agent_id is null or trim(p_agent_id) = '' or
     p_provider_id is null or trim(p_provider_id) = '' or
     p_idempotency_key is null or trim(p_idempotency_key) = '' then
    raise exception 'write_recovery_scope_invalid';
  end if;
  if p_risk not in ('write', 'consequential') then raise exception 'write_recovery_risk_invalid'; end if;
  if p_work_item_id is distinct from 'specialist-mesh:' || p_task_id then raise exception 'write_recovery_work_item_mismatch'; end if;
  if p_fencing_token is null or p_fencing_token < 1 then raise exception 'write_recovery_fence_invalid'; end if;

  -- Serialize recovery preparation with lease expiry/release/takeover before validating the fence.
  perform 1
  from public.supervisor_leases
  where work_item_id = p_work_item_id
    and lease_id = p_lease_id
  for update;
  if not found then raise exception 'stale_owner_rejected'; end if;

  if not public.supervisor_assert_fence(
    p_work_item_id, p_lease_id, p_owner_instance_id, p_owner_runtime_id, p_fencing_token, v_now
  ) then
    raise exception 'stale_owner_rejected';
  end if;

  insert into public.a2a_specialist_mesh_write_recovery_attempts(
    attempt_key, operation_key, work_item_id, tenant_id, environment_id, portable_id,
    task_id, skill_id, risk, agent_id, fencing_token, provider_id, idempotency_key, status, created_at
  ) values (
    p_attempt_key, p_operation_key, p_work_item_id, p_tenant_id, p_environment_id, p_portable_id,
    p_task_id, p_skill_id, p_risk, p_agent_id, p_fencing_token, p_provider_id, p_idempotency_key, 'prepared', v_now
  )
  on conflict (attempt_key) do nothing;

  select * into v_row
  from public.a2a_specialist_mesh_write_recovery_attempts
  where attempt_key = p_attempt_key
  for update;

  if not found or
     v_row.operation_key is distinct from p_operation_key or
     v_row.work_item_id is distinct from p_work_item_id or
     v_row.agent_id is distinct from p_agent_id or
     v_row.fencing_token is distinct from p_fencing_token or
     v_row.provider_id is distinct from p_provider_id or
     v_row.idempotency_key is distinct from p_idempotency_key or
     v_row.risk is distinct from p_risk then
    raise exception 'write_recovery_prepare_conflict';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.a2a_specialist_mesh_write_recovery_record(
  p_attempt_key text,
  p_work_item_id text,
  p_lease_id text,
  p_owner_instance_id text,
  p_owner_runtime_id text,
  p_fencing_token integer,
  p_idempotency_key text,
  p_outcome text,
  p_evidence_ref text,
  p_provider_operation_ref text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.a2a_specialist_mesh_write_recovery_attempts%rowtype;
begin
  if p_outcome not in ('applied', 'not_applied', 'unknown') then raise exception 'write_reconciliation_invalid'; end if;
  if p_evidence_ref is null or trim(p_evidence_ref) = '' then raise exception 'write_reconciliation_evidence_required'; end if;

  -- Keep ownership stable through provider-proof persistence.
  perform 1
  from public.supervisor_leases
  where work_item_id = p_work_item_id
    and lease_id = p_lease_id
  for update;
  if not found then raise exception 'stale_owner_rejected'; end if;

  if not public.supervisor_assert_fence(
    p_work_item_id, p_lease_id, p_owner_instance_id, p_owner_runtime_id, p_fencing_token, v_now
  ) then
    raise exception 'stale_owner_rejected';
  end if;

  select * into v_row
  from public.a2a_specialist_mesh_write_recovery_attempts
  where attempt_key = p_attempt_key
    and work_item_id = p_work_item_id
    and fencing_token = p_fencing_token
    and idempotency_key = p_idempotency_key
  for update;
  if not found then raise exception 'write_recovery_prepare_missing'; end if;

  if v_row.status = 'prepared' then
    update public.a2a_specialist_mesh_write_recovery_attempts
    set status = p_outcome,
        provider_evidence_ref = p_evidence_ref,
        provider_operation_ref = nullif(trim(p_provider_operation_ref), ''),
        reconciled_at = v_now
    where attempt_key = p_attempt_key
    returning * into v_row;
  elsif v_row.status = p_outcome and
        v_row.provider_evidence_ref is not distinct from p_evidence_ref and
        v_row.provider_operation_ref is not distinct from nullif(trim(p_provider_operation_ref), '') then
    -- Exact duplicate reconciliation is idempotent.
    null;
  else
    raise exception 'write_recovery_record_conflict';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.a2a_specialist_mesh_write_recovery_prepare(text,text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text) from public, anon, authenticated;
revoke all on function public.a2a_specialist_mesh_write_recovery_record(text,text,text,text,text,integer,text,text,text,text) from public, anon, authenticated;
grant execute on function public.a2a_specialist_mesh_write_recovery_prepare(text,text,text,text,text,text,text,text,text,text,text,text,text,integer,text,text) to service_role;
grant execute on function public.a2a_specialist_mesh_write_recovery_record(text,text,text,text,text,integer,text,text,text,text) to service_role;
