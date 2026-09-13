-- Specialist Mesh Phase 5 Production acceptance provider.
-- This is an isolated SignalBoost reference provider used only to prove real idempotent write recovery.
-- It is not buyer-live evidence and does not imply that external social/CRM providers are replay-safe.

create table if not exists public.a2a_specialist_mesh_write_acceptance_effects (
  operation_key text primary key,
  idempotency_key text not null unique,
  applied_by_agent text not null,
  payload_digest text not null,
  created_at timestamptz not null default now(),
  constraint a2a_specialist_mesh_write_acceptance_effect_nonempty check (
    length(trim(operation_key)) > 0 and length(trim(idempotency_key)) > 0 and
    length(trim(applied_by_agent)) > 0 and length(trim(payload_digest)) > 0
  )
);

create table if not exists public.a2a_specialist_mesh_write_acceptance_reconciliations (
  reconciliation_id uuid primary key default gen_random_uuid(),
  operation_key text not null,
  idempotency_key text not null,
  outcome text not null check (outcome in ('applied', 'not_applied', 'unknown')),
  effect_created_at timestamptz,
  observed_at timestamptz not null default now(),
  constraint a2a_specialist_mesh_write_acceptance_reconcile_nonempty check (
    length(trim(operation_key)) > 0 and length(trim(idempotency_key)) > 0
  )
);

create index if not exists a2a_specialist_mesh_write_acceptance_reconcile_operation_idx
  on public.a2a_specialist_mesh_write_acceptance_reconciliations (operation_key, observed_at desc);

alter table public.a2a_specialist_mesh_write_acceptance_effects enable row level security;
alter table public.a2a_specialist_mesh_write_acceptance_reconciliations enable row level security;
revoke all on table public.a2a_specialist_mesh_write_acceptance_effects from public, anon, authenticated, service_role;
revoke all on table public.a2a_specialist_mesh_write_acceptance_reconciliations from public, anon, authenticated, service_role;

comment on table public.a2a_specialist_mesh_write_acceptance_effects is
  'Isolated Production acceptance side effects for Specialist Mesh Phase 5. Not customer content and not buyer-live evidence.';
comment on table public.a2a_specialist_mesh_write_acceptance_reconciliations is
  'Durable provider-side reconciliation observations for the isolated Phase 5 Production acceptance provider.';

create or replace function public.a2a_specialist_mesh_write_acceptance_apply(
  p_operation_key text,
  p_idempotency_key text,
  p_agent_id text,
  p_payload_digest text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.a2a_specialist_mesh_write_acceptance_effects%rowtype;
begin
  if p_operation_key is null or trim(p_operation_key) = '' or
     p_idempotency_key is null or trim(p_idempotency_key) = '' or
     p_agent_id is null or trim(p_agent_id) = '' or
     p_payload_digest is null or trim(p_payload_digest) = '' then
    raise exception 'write_acceptance_apply_invalid';
  end if;

  insert into public.a2a_specialist_mesh_write_acceptance_effects(
    operation_key, idempotency_key, applied_by_agent, payload_digest
  ) values (
    p_operation_key, p_idempotency_key, p_agent_id, p_payload_digest
  )
  on conflict (operation_key) do nothing;

  select * into v_row
  from public.a2a_specialist_mesh_write_acceptance_effects
  where operation_key = p_operation_key
  for update;

  if not found then raise exception 'write_acceptance_effect_missing'; end if;
  if v_row.idempotency_key is distinct from p_idempotency_key or
     v_row.payload_digest is distinct from p_payload_digest then
    raise exception 'write_acceptance_idempotency_conflict';
  end if;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.a2a_specialist_mesh_write_acceptance_reconcile(
  p_operation_key text,
  p_idempotency_key text,
  p_force_unknown boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_effect public.a2a_specialist_mesh_write_acceptance_effects%rowtype;
  v_reconciliation public.a2a_specialist_mesh_write_acceptance_reconciliations%rowtype;
  v_outcome text;
begin
  if p_operation_key is null or trim(p_operation_key) = '' or
     p_idempotency_key is null or trim(p_idempotency_key) = '' then
    raise exception 'write_acceptance_reconcile_invalid';
  end if;

  select * into v_effect
  from public.a2a_specialist_mesh_write_acceptance_effects
  where operation_key = p_operation_key;

  if p_force_unknown then
    v_outcome := 'unknown';
  elsif found then
    if v_effect.idempotency_key is distinct from p_idempotency_key then
      v_outcome := 'unknown';
    else
      v_outcome := 'applied';
    end if;
  else
    v_outcome := 'not_applied';
  end if;

  insert into public.a2a_specialist_mesh_write_acceptance_reconciliations(
    operation_key, idempotency_key, outcome, effect_created_at
  ) values (
    p_operation_key,
    p_idempotency_key,
    v_outcome,
    case when found then v_effect.created_at else null end
  ) returning * into v_reconciliation;

  return jsonb_build_object(
    'outcome', v_outcome,
    'evidence_ref', 'db://a2a_specialist_mesh_write_acceptance_reconciliations/' || v_reconciliation.reconciliation_id::text,
    'provider_operation_ref', p_operation_key,
    'effect_created_at', v_effect.created_at
  );
end;
$$;

revoke all on function public.a2a_specialist_mesh_write_acceptance_apply(text,text,text,text) from public, anon, authenticated;
revoke all on function public.a2a_specialist_mesh_write_acceptance_reconcile(text,text,boolean) from public, anon, authenticated;
grant execute on function public.a2a_specialist_mesh_write_acceptance_apply(text,text,text,text) to service_role;
grant execute on function public.a2a_specialist_mesh_write_acceptance_reconcile(text,text,boolean) to service_role;
