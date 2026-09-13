-- Specialist Mesh advisory checkpoint/resume.
-- Checkpoints preserve bounded progress only; they never grant qualification, scope, approval, or tool authority.
create table if not exists public.a2a_specialist_mesh_checkpoints (
  checkpoint_key text primary key,
  work_item_id text not null references public.supervisor_work_items(work_item_id) on delete cascade,
  tenant_id text not null,
  environment_id text not null,
  portable_id text not null,
  task_id text not null,
  skill_id text not null,
  agent_id text not null,
  fencing_token integer not null check (fencing_token > 0),
  checkpoint_state jsonb not null,
  checkpoint_bytes integer not null check (checkpoint_bytes between 2 and 65536),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint a2a_specialist_mesh_checkpoint_scope_nonempty check (
    length(trim(checkpoint_key)) > 0 and length(trim(work_item_id)) > 0 and
    length(trim(tenant_id)) > 0 and length(trim(environment_id)) > 0 and
    length(trim(portable_id)) > 0 and length(trim(task_id)) > 0 and
    length(trim(skill_id)) > 0 and length(trim(agent_id)) > 0
  ),
  constraint a2a_specialist_mesh_checkpoint_state_object check (jsonb_typeof(checkpoint_state) = 'object'),
  constraint a2a_specialist_mesh_checkpoint_window check (
    expires_at > created_at and expires_at <= created_at + interval '1 hour'
  )
);

create index if not exists a2a_specialist_mesh_checkpoints_expiry_idx
  on public.a2a_specialist_mesh_checkpoints (expires_at);

alter table public.a2a_specialist_mesh_checkpoints enable row level security;

comment on table public.a2a_specialist_mesh_checkpoints is
  'Service-role-only bounded advisory progress. Current Supervisor fencing is required for every load/save/clear; checkpoint data grants no authority.';

create or replace function public.a2a_specialist_mesh_checkpoint_save(
  p_checkpoint_key text,
  p_work_item_id text,
  p_tenant_id text,
  p_environment_id text,
  p_portable_id text,
  p_task_id text,
  p_skill_id text,
  p_agent_id text,
  p_lease_id text,
  p_owner_instance_id text,
  p_owner_runtime_id text,
  p_fencing_token integer,
  p_checkpoint_state jsonb,
  p_expires_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.a2a_specialist_mesh_checkpoints%rowtype;
  v_bytes integer;
begin
  if p_checkpoint_key is null or trim(p_checkpoint_key) = '' or
     p_work_item_id is null or trim(p_work_item_id) = '' or
     p_tenant_id is null or trim(p_tenant_id) = '' or
     p_environment_id is null or trim(p_environment_id) = '' or
     p_portable_id is null or trim(p_portable_id) = '' or
     p_task_id is null or trim(p_task_id) = '' or
     p_skill_id is null or trim(p_skill_id) = '' or
     p_agent_id is null or trim(p_agent_id) = '' then
    raise exception 'checkpoint_scope_invalid';
  end if;
  if p_work_item_id is distinct from 'specialist-mesh:' || p_task_id then
    raise exception 'checkpoint_work_item_mismatch';
  end if;
  if p_checkpoint_state is null or jsonb_typeof(p_checkpoint_state) <> 'object' then
    raise exception 'checkpoint_state_invalid';
  end if;
  v_bytes := octet_length(p_checkpoint_state::text);
  if v_bytes > 65536 then raise exception 'checkpoint_state_too_large'; end if;
  if p_expires_at is null or p_expires_at <= v_now or p_expires_at > v_now + interval '1 hour' then
    raise exception 'checkpoint_ttl_invalid';
  end if;

  -- Serialize checkpoint mutation with lease release/expiry/takeover. Every Supervisor
  -- ownership mutation touches this exact row, so a new owner cannot cross the fence
  -- validation and checkpoint write while this transaction holds the row lock.
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

  insert into public.a2a_specialist_mesh_checkpoints(
    checkpoint_key, work_item_id, tenant_id, environment_id, portable_id, task_id,
    skill_id, agent_id, fencing_token, checkpoint_state, checkpoint_bytes, created_at, expires_at
  ) values (
    p_checkpoint_key, p_work_item_id, p_tenant_id, p_environment_id, p_portable_id, p_task_id,
    p_skill_id, p_agent_id, p_fencing_token, p_checkpoint_state, v_bytes, v_now, p_expires_at
  )
  on conflict (checkpoint_key) do update set
    work_item_id = excluded.work_item_id,
    tenant_id = excluded.tenant_id,
    environment_id = excluded.environment_id,
    portable_id = excluded.portable_id,
    task_id = excluded.task_id,
    skill_id = excluded.skill_id,
    agent_id = excluded.agent_id,
    fencing_token = excluded.fencing_token,
    checkpoint_state = excluded.checkpoint_state,
    checkpoint_bytes = excluded.checkpoint_bytes,
    created_at = excluded.created_at,
    expires_at = excluded.expires_at
  where public.a2a_specialist_mesh_checkpoints.fencing_token <= excluded.fencing_token
  returning * into v_row;

  if not found then raise exception 'stale_checkpoint_rejected'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.a2a_specialist_mesh_checkpoint_load(
  p_checkpoint_key text,
  p_work_item_id text,
  p_lease_id text,
  p_owner_instance_id text,
  p_owner_runtime_id text,
  p_fencing_token integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_row public.a2a_specialist_mesh_checkpoints%rowtype;
begin
  -- Keep the ownership decision stable through expired-row cleanup and resume read.
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

  delete from public.a2a_specialist_mesh_checkpoints
  where checkpoint_key = p_checkpoint_key and expires_at <= v_now;

  select * into v_row
  from public.a2a_specialist_mesh_checkpoints
  where checkpoint_key = p_checkpoint_key
    and work_item_id = p_work_item_id
    and fencing_token < p_fencing_token
    and expires_at > v_now;

  if not found then return null; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public.a2a_specialist_mesh_checkpoint_clear(
  p_checkpoint_key text,
  p_work_item_id text,
  p_lease_id text,
  p_owner_instance_id text,
  p_owner_runtime_id text,
  p_fencing_token integer
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
begin
  -- Serialize deletion with lease release/expiry/takeover for the same reason as save.
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
  delete from public.a2a_specialist_mesh_checkpoints
  where checkpoint_key = p_checkpoint_key
    and work_item_id = p_work_item_id
    and fencing_token <= p_fencing_token;
  return true;
end;
$$;

revoke all on function public.a2a_specialist_mesh_checkpoint_save(text,text,text,text,text,text,text,text,text,text,text,integer,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.a2a_specialist_mesh_checkpoint_load(text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.a2a_specialist_mesh_checkpoint_clear(text,text,text,text,text,integer) from public, anon, authenticated;
grant execute on function public.a2a_specialist_mesh_checkpoint_save(text,text,text,text,text,text,text,text,text,text,text,integer,jsonb,timestamptz) to service_role;
grant execute on function public.a2a_specialist_mesh_checkpoint_load(text,text,text,text,text,integer) to service_role;
grant execute on function public.a2a_specialist_mesh_checkpoint_clear(text,text,text,text,text,integer) to service_role;