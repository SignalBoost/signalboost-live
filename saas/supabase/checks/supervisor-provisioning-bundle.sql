-- saas/supabase/checks/supervisor-provisioning-bundle.sql
--
-- EVERY MISSING SUPERVISOR TABLE, IN ONE PASTE.
--
-- On 28 July 2026 an inventory found fifteen of the sixteen tables the supervisor stack
-- expects were absent from the live database. The observation cron had been running every
-- fifteen minutes with nowhere to write, and nothing said so: one page crashed without
-- naming a cause, another caught the same failure and reported an empty result.
--
-- This is the eight migrations the Self-Healing Supervisor needs, concatenated in dependency
-- order. Nothing here is newly written SQL — each section is the verbatim contents of a file
-- already in saas/supabase/migrations.
--
-- SAFE TO RUN TWICE. Tables and indexes use "if not exists"; every policy is preceded by a
-- "drop policy if exists" added during assembly, because "create policy" has no such guard
-- and would otherwise fail the second time. If a section errors, everything before it has
-- already been applied — fix the cause and run the whole file again rather than guessing
-- where it stopped.
--
-- AFTER RUNNING, re-run supabase/checks/supervisor-table-inventory.sql. Everything except the
-- four mission_* tables should read "present" — those belong to a different subsystem and are
-- deliberately excluded.


-- ============================================================================
-- SECTION 0 of 8 — the helper the row-level-security policies depend on
--
-- Verbatim from 20260528_ai_outreach_adm.sql. It is included because the supervisor
-- migrations reference public.is_signalboost_admin() but none of them define it: if that
-- migration was never applied here, every policy below would fail on an undefined function.
-- "create or replace" makes this harmless when it already exists.
-- ============================================================================

create or replace function public.is_signalboost_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = any(
      string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ',')
    ),
    false
  )
  or exists (
    select 1
    from public.team_members tm
    where (tm.member_id = auth.uid() or tm.owner_id = auth.uid())
      and (tm.status = 'active' or tm.owner_id = auth.uid())
      and (tm.role in ('owner','admin') or tm.owner_id = auth.uid())
  );
$$;


-- ============================================================================
-- SECTION 1 of 8 — 20260716_supervisor_execution_history.sql
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.supervisor_executions (
  id uuid primary key default gen_random_uuid(), execution_id text not null unique, dispatch_id text not null,
  incident_id text not null, plan_id text not null, package_id text, package_fingerprint text,
  provider text not null, target_environment text not null check (target_environment in ('sandbox','preview','production')),
  target_origin text not null, executor_kind text not null check (executor_kind in ('api','browser','manual')),
  execution_mode text not null check (execution_mode in ('dry_run','sandbox_execute')),
  status text not null check (status in ('requested','started','paused_for_approval','continuation_started','completed','failed','verification_failed','rejected','expired','abandoned_after_restart')),
  verification_status text not null check (verification_status in ('pending','verified','failed','not_required')),
  checkpoint_status text not null check (checkpoint_status in ('none','pending_approval','approved','expired','abandoned')),
  approved_step_ids text[] not null default '{}', completed_step_ids text[] not null default '{}', skipped_step_ids text[] not null default '{}',
  started_at timestamptz not null, paused_at timestamptz, completed_at timestamptz, failed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  schema_version text not null, sanitized_error_code text, sanitized_error_message text,
  metadata jsonb not null default '{}',
  constraint supervisor_executions_sandbox_only check (target_environment = 'sandbox'),
  constraint supervisor_executions_completed_verified check (status <> 'completed' or verification_status = 'verified')
);

create table if not exists public.supervisor_audit_events (
  id uuid primary key default gen_random_uuid(), event_id text not null unique, execution_id text,
  dispatch_id text, incident_id text not null, event_type text not null, occurred_at timestamptz not null,
  payload jsonb not null default '{}', schema_version text not null, created_at timestamptz not null default now()
);

create table if not exists public.supervisor_evidence (
  id uuid primary key default gen_random_uuid(), evidence_id text not null unique, execution_id text not null,
  step_id text, evidence_type text not null, artifact_reference text not null, digest text, captured_at timestamptz not null,
  metadata jsonb not null default '{}', schema_version text not null
);

create index if not exists supervisor_executions_created_idx on public.supervisor_executions(created_at desc, execution_id desc);
create index if not exists supervisor_executions_incident_idx on public.supervisor_executions(incident_id);
create index if not exists supervisor_audit_events_execution_idx on public.supervisor_audit_events(execution_id, occurred_at asc);
create index if not exists supervisor_evidence_execution_idx on public.supervisor_evidence(execution_id, captured_at asc);

alter table public.supervisor_executions enable row level security;
alter table public.supervisor_audit_events enable row level security;
alter table public.supervisor_evidence enable row level security;

drop policy if exists "Admins can read supervisor executions" on public.supervisor_executions;
drop policy if exists "Admins can read supervisor executions" on public.supervisor_executions;
create policy "Admins can read supervisor executions" on public.supervisor_executions for select to authenticated using (public.is_signalboost_admin());
drop policy if exists "Admins can read supervisor audit events" on public.supervisor_audit_events;
drop policy if exists "Admins can read supervisor audit events" on public.supervisor_audit_events;
create policy "Admins can read supervisor audit events" on public.supervisor_audit_events for select to authenticated using (public.is_signalboost_admin());
drop policy if exists "Admins can read supervisor evidence" on public.supervisor_evidence;
drop policy if exists "Admins can read supervisor evidence" on public.supervisor_evidence;
create policy "Admins can read supervisor evidence" on public.supervisor_evidence for select to authenticated using (public.is_signalboost_admin());

comment on table public.supervisor_executions is 'Sanitized durable Mission 001 sandbox execution history. Records are audit-only and cannot authorize replay/resume.';
comment on table public.supervisor_audit_events is 'Immutable sanitized supervisor lifecycle events for operator audit history.';
comment on table public.supervisor_evidence is 'Safe evidence references and digests only; no image binaries, browser state, cookies, tokens, or local paths.';


-- ============================================================================
-- SECTION 2 of 8 — 20260716_supervisor_federated_coordination.sql
-- ============================================================================

-- Mission 001 durable federated Supervisor coordination. Service-role/server RPCs are the write boundary.
create extension if not exists pgcrypto;

create table if not exists public.supervisor_instances (
  id uuid primary key default gen_random_uuid(), instance_id text not null, runtime_id text not null, region text, availability_zone text, software_version text not null, supported_provider_kinds text[] not null default '{}', status text not null check (status in ('starting','healthy','draining','unavailable','stopped')), started_at timestamptz not null, heartbeat_at timestamptz not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), schema_version text not null, unique(instance_id,runtime_id)
);
create table if not exists public.supervisor_work_items (
  id uuid primary key default gen_random_uuid(), work_item_id text not null unique, idempotency_key text, work_item_type text not null, incident_id text not null, dispatch_id text, execution_id text, provider text not null, tenant_id text, organization_id text, project_scope text, resource_scope text, environment text not null check (environment in ('sandbox','preview','production')), state text not null check (state in ('queued','leased','processing','paused_for_approval','verification_pending','completed','failed','blocked','expired','abandoned')), priority integer not null default 0, available_at timestamptz not null default now(), attempt integer not null default 0 check (attempt >= 0), max_attempts integer not null default 3 check (max_attempts between 1 and 25), policy_version text not null, capability_version text, adapter_version text, fencing_generation integer not null default 0 check (fencing_generation >= 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), terminal_at timestamptz, schema_version text not null, sanitized_metadata jsonb not null default '{}'::jsonb, check ((state in ('completed','failed','blocked','expired','abandoned')) = (terminal_at is not null) or state not in ('completed','failed','blocked','expired','abandoned'))
);
create unique index if not exists supervisor_work_items_idempotency_scope_idx on public.supervisor_work_items(provider, coalesce(tenant_id,''), coalesce(organization_id,''), idempotency_key) where idempotency_key is not null;
create index if not exists supervisor_work_items_available_idx on public.supervisor_work_items(provider, tenant_id, state, available_at, priority desc);

create table if not exists public.supervisor_leases (
  id uuid primary key default gen_random_uuid(), lease_id text not null unique, work_item_id text not null references public.supervisor_work_items(work_item_id), owner_instance_id text not null, owner_runtime_id text not null, fencing_token integer not null check (fencing_token > 0), acquired_at timestamptz not null, heartbeat_at timestamptz not null, expires_at timestamptz not null, released_at timestamptz, status text not null check (status in ('active','released','expired')), policy_version text not null, schema_version text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (expires_at > acquired_at)
);
create unique index if not exists supervisor_leases_one_active_idx on public.supervisor_leases(work_item_id) where status='active' and released_at is null;

create table if not exists public.supervisor_coordination_events (
  id uuid primary key default gen_random_uuid(), event_id text not null unique, work_item_id text, lease_id text, instance_id text, runtime_id text, event_type text not null, fencing_token integer, occurred_at timestamptz not null, payload jsonb not null default '{}'::jsonb, schema_version text not null, created_at timestamptz not null default now()
);
create index if not exists supervisor_coordination_events_work_idx on public.supervisor_coordination_events(work_item_id, occurred_at desc);

alter table public.supervisor_instances enable row level security;
alter table public.supervisor_work_items enable row level security;
alter table public.supervisor_leases enable row level security;
alter table public.supervisor_coordination_events enable row level security;
drop policy if exists supervisor_coordination_no_anon_instances on public.supervisor_instances;
create policy supervisor_coordination_no_anon_instances on public.supervisor_instances for select using (auth.role() = 'authenticated');
drop policy if exists supervisor_coordination_no_anon_work on public.supervisor_work_items;
create policy supervisor_coordination_no_anon_work on public.supervisor_work_items for select using (auth.role() = 'authenticated');
drop policy if exists supervisor_coordination_no_anon_leases on public.supervisor_leases;
create policy supervisor_coordination_no_anon_leases on public.supervisor_leases for select using (auth.role() = 'authenticated');
drop policy if exists supervisor_coordination_no_anon_events on public.supervisor_coordination_events;
create policy supervisor_coordination_no_anon_events on public.supervisor_coordination_events for select using (auth.role() = 'authenticated');

create or replace function public.supervisor_acquire_lease(p_work_item_id text,p_owner_instance_id text,p_owner_runtime_id text,p_lease_duration_ms integer,p_now timestamptz default now()) returns jsonb language plpgsql security definer set search_path=public as $$
declare w supervisor_work_items%rowtype; inst supervisor_instances%rowtype; l supervisor_leases%rowtype; next_token integer;
begin
  select * into inst from supervisor_instances where instance_id=p_owner_instance_id and runtime_id=p_owner_runtime_id for update;
  if not found or inst.status <> 'healthy' then raise exception 'owner_unavailable'; end if;
  select * into w from supervisor_work_items where work_item_id=p_work_item_id for update;
  if not found or w.state in ('completed','failed','blocked','expired','abandoned') then raise exception 'work_unavailable'; end if;
  if exists (select 1 from supervisor_leases where work_item_id=p_work_item_id and status='active' and released_at is null and expires_at > p_now) then raise exception 'lease_conflict'; end if;
  update supervisor_leases set status='expired', updated_at=p_now where work_item_id=p_work_item_id and status='active' and released_at is null and expires_at <= p_now;
  next_token := w.fencing_generation + 1;
  update supervisor_work_items set state='leased', attempt=attempt+1, fencing_generation=next_token, updated_at=p_now where work_item_id=p_work_item_id;
  insert into supervisor_leases(lease_id,work_item_id,owner_instance_id,owner_runtime_id,fencing_token,acquired_at,heartbeat_at,expires_at,status,policy_version,schema_version) values ('lease-'||p_work_item_id||'-'||next_token,p_work_item_id,p_owner_instance_id,p_owner_runtime_id,next_token,p_now,p_now,p_now + make_interval(secs => p_lease_duration_ms/1000.0),'active',w.policy_version,'supervisor-lease-v1') returning * into l;
  return jsonb_build_object('lease',to_jsonb(l));
end $$;
create or replace function public.supervisor_assert_fence(p_work_item_id text,lease_id text,owner_instance_id text,owner_runtime_id text,fencing_token integer,p_now timestamptz default now()) returns boolean language sql security definer set search_path=public as $$
  select exists(select 1 from supervisor_work_items w join supervisor_leases l on l.work_item_id=w.work_item_id where w.work_item_id=p_work_item_id and l.lease_id=supervisor_assert_fence.lease_id and l.owner_instance_id=supervisor_assert_fence.owner_instance_id and l.owner_runtime_id=supervisor_assert_fence.owner_runtime_id and l.fencing_token=supervisor_assert_fence.fencing_token and w.fencing_generation=supervisor_assert_fence.fencing_token and l.status='active' and l.released_at is null and l.expires_at > p_now and w.state in ('leased','processing','paused_for_approval','verification_pending'));
$$;
create or replace function public.supervisor_renew_lease(lease_id text,owner_instance_id text,owner_runtime_id text,fencing_token integer,p_lease_duration_ms integer,p_now timestamptz default now()) returns supervisor_leases language plpgsql security definer set search_path=public as $$
declare l supervisor_leases%rowtype; inst supervisor_instances%rowtype;
begin
  select * into l from supervisor_leases where supervisor_leases.lease_id=supervisor_renew_lease.lease_id for update;
  select * into inst from supervisor_instances where instance_id=owner_instance_id and runtime_id=owner_runtime_id for update;
  if not found or inst.status not in ('healthy','draining') then raise exception 'owner_unavailable'; end if;
  if l.lease_id is null or l.owner_instance_id<>owner_instance_id or l.owner_runtime_id<>owner_runtime_id or l.fencing_token<>fencing_token or l.status<>'active' or l.released_at is not null or l.expires_at<=p_now then raise exception 'stale_owner_rejected'; end if;
  if not public.supervisor_assert_fence(l.work_item_id,l.lease_id,owner_instance_id,owner_runtime_id,fencing_token,p_now) then raise exception 'stale_owner_rejected'; end if;
  update supervisor_leases set heartbeat_at=p_now, expires_at=p_now + make_interval(secs => p_lease_duration_ms/1000.0), updated_at=p_now where id=l.id returning * into l; return l;
end $$;
create or replace function public.supervisor_release_lease(lease_id text,owner_instance_id text,owner_runtime_id text,fencing_token integer,p_now timestamptz default now(),p_reason text default 'voluntary') returns boolean language plpgsql security definer set search_path=public as $$
declare l supervisor_leases%rowtype; st text;
begin
  if p_reason not in ('completed','blocked','failed','draining','voluntary','lost_capability') then raise exception 'invalid_release_reason'; end if;
  select * into l from supervisor_leases where supervisor_leases.lease_id=supervisor_release_lease.lease_id for update;
  if l.lease_id is null or l.owner_instance_id<>owner_instance_id or l.owner_runtime_id<>owner_runtime_id or l.fencing_token<>fencing_token or l.status<>'active' or l.released_at is not null then raise exception 'stale_owner_rejected'; end if;
  update supervisor_leases set status='released', released_at=p_now, updated_at=p_now where id=l.id;
  select state into st from supervisor_work_items where work_item_id=l.work_item_id for update;
  if st not in ('completed','failed','blocked','expired','abandoned') then update supervisor_work_items set state='queued', updated_at=p_now where work_item_id=l.work_item_id; end if;
  return true;
end $$;
create or replace function public.supervisor_transition_work_item(p_work_item_id text,p_from_state text,p_to_state text,p_execution_id text,lease_id text,owner_instance_id text,owner_runtime_id text,fencing_token integer,p_now timestamptz default now()) returns supervisor_work_items language plpgsql security definer set search_path=public as $$
declare w supervisor_work_items%rowtype;
begin
  if not public.supervisor_assert_fence(p_work_item_id,lease_id,owner_instance_id,owner_runtime_id,fencing_token,p_now) then raise exception 'stale_owner_rejected'; end if;
  select * into w from supervisor_work_items where work_item_id=p_work_item_id for update;
  if w.state in ('completed','failed','blocked','expired','abandoned') then raise exception 'terminal_work'; end if;
  if p_from_state is not null and w.state<>p_from_state then raise exception 'state_conflict'; end if;
  if not ((w.state='leased' and p_to_state in ('processing','failed','blocked')) or (w.state='processing' and p_to_state in ('paused_for_approval','verification_pending','completed','failed','blocked')) or (w.state='paused_for_approval' and p_to_state in ('processing','verification_pending')) or (w.state='verification_pending' and p_to_state in ('completed','failed','blocked')) or (p_to_state='abandoned')) then raise exception 'invalid_transition'; end if;
  update supervisor_work_items set state=p_to_state, execution_id=coalesce(p_execution_id,execution_id), terminal_at=case when p_to_state in ('completed','failed','blocked','expired','abandoned') then p_now else null end, updated_at=p_now where id=w.id returning * into w; return w;
end $$;
create or replace function public.supervisor_reconcile_expired_leases(p_now timestamptz default now(),p_limit integer default 100) returns setof supervisor_work_items language plpgsql security definer set search_path=public as $$
declare l supervisor_leases%rowtype; w supervisor_work_items%rowtype;
begin
  for l in select * from supervisor_leases where status='active' and released_at is null and expires_at<=p_now order by expires_at limit least(greatest(p_limit,1),100) for update skip locked loop
    update supervisor_leases set status='expired', updated_at=p_now where id=l.id;
    select * into w from supervisor_work_items where work_item_id=l.work_item_id for update;
    if w.state not in ('completed','failed','blocked','expired','abandoned') then
      if w.work_item_type like 'browser%' or w.environment='production' then update supervisor_work_items set state='abandoned', terminal_at=p_now, updated_at=p_now where id=w.id returning * into w; else update supervisor_work_items set state=case when attempt < max_attempts then 'queued' else 'blocked' end, terminal_at=case when attempt < max_attempts then null else p_now end, updated_at=p_now where id=w.id returning * into w; end if;
      return next w;
    end if;
  end loop;
end $$;
create or replace function public.supervisor_enqueue_work_item(p_work_item jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare existing supervisor_work_items%rowtype; inserted supervisor_work_items%rowtype; key text := p_work_item->>'idempotency_key';
begin
  if p_work_item::text ~* '(secret|token|cookie|password|authorization|api[_-]?key|credential)' then raise exception 'unsafe_metadata'; end if;
  if key is not null then select * into existing from supervisor_work_items where provider=p_work_item->>'provider' and coalesce(tenant_id,'')=coalesce(p_work_item->>'tenant_id','') and coalesce(organization_id,'')=coalesce(p_work_item->>'organization_id','') and idempotency_key=key limit 1; if found then return jsonb_build_object('deduplicated',true,'work_item',to_jsonb(existing)); end if; end if;
  insert into supervisor_work_items(work_item_id,idempotency_key,work_item_type,incident_id,dispatch_id,execution_id,provider,tenant_id,organization_id,project_scope,resource_scope,environment,state,priority,available_at,attempt,max_attempts,policy_version,capability_version,adapter_version,fencing_generation,schema_version,sanitized_metadata) values (p_work_item->>'work_item_id',key,p_work_item->>'work_item_type',p_work_item->>'incident_id',p_work_item->>'dispatch_id',p_work_item->>'execution_id',p_work_item->>'provider',p_work_item->>'tenant_id',p_work_item->>'organization_id',p_work_item->>'project_scope',p_work_item->>'resource_scope',p_work_item->>'environment',coalesce(p_work_item->>'state','queued'),coalesce((p_work_item->>'priority')::int,0),coalesce((p_work_item->>'available_at')::timestamptz,now()),coalesce((p_work_item->>'attempt')::int,0),coalesce((p_work_item->>'max_attempts')::int,3),p_work_item->>'policy_version',p_work_item->>'capability_version',p_work_item->>'adapter_version',0,p_work_item->>'schema_version',coalesce(p_work_item->'sanitized_metadata','{}'::jsonb)) returning * into inserted;
  return jsonb_build_object('deduplicated',false,'work_item',to_jsonb(inserted));
end $$;
create or replace function public.supervisor_heartbeat_instance(p_instance_id text,p_runtime_id text,p_heartbeat_at timestamptz default now()) returns supervisor_instances language plpgsql security definer set search_path=public as $$ declare i supervisor_instances%rowtype; begin update supervisor_instances set heartbeat_at=p_heartbeat_at,status=case when status='starting' then 'healthy' else status end,updated_at=p_heartbeat_at where instance_id=p_instance_id and runtime_id=p_runtime_id and status not in ('unavailable','stopped') returning * into i; if i.instance_id is null then raise exception 'stale_owner_rejected'; end if; return i; end $$;
create or replace function public.supervisor_mark_instance_status(p_instance_id text,p_runtime_id text,p_status text) returns supervisor_instances language plpgsql security definer set search_path=public as $$ declare i supervisor_instances%rowtype; begin if p_status not in ('draining','unavailable','stopped') then raise exception 'invalid_status'; end if; update supervisor_instances set status=p_status,updated_at=now() where instance_id=p_instance_id and runtime_id=p_runtime_id returning * into i; if i.instance_id is null then raise exception 'stale_owner_rejected'; end if; return i; end $$;
revoke all on function public.supervisor_acquire_lease(text,text,text,integer,timestamptz) from anon, authenticated;
revoke all on function public.supervisor_assert_fence(text,text,text,text,integer,timestamptz) from anon, authenticated;
revoke all on function public.supervisor_renew_lease(text,text,text,integer,integer,timestamptz) from anon, authenticated;
revoke all on function public.supervisor_release_lease(text,text,text,integer,timestamptz,text) from anon, authenticated;


-- ============================================================================
-- SECTION 3 of 8 — 20260718_supervisor_coordination_security_hardening.sql
-- ============================================================================

-- Mission 001 coordination security hardening.
-- Keep all coordination mutations behind server-side service-role access.

revoke insert, update, delete, truncate, references, trigger
  on table public.supervisor_instances,
           public.supervisor_work_items,
           public.supervisor_leases,
           public.supervisor_coordination_events
  from anon, authenticated;

revoke execute on function public.supervisor_acquire_lease(text,text,text,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_assert_fence(text,text,text,text,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_renew_lease(text,text,text,integer,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_release_lease(text,text,text,integer,timestamptz,text) from anon, authenticated;
revoke execute on function public.supervisor_transition_work_item(text,text,text,text,text,text,text,integer,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_reconcile_expired_leases(timestamptz,integer) from anon, authenticated;
revoke execute on function public.supervisor_enqueue_work_item(jsonb) from anon, authenticated;
revoke execute on function public.supervisor_heartbeat_instance(text,text,timestamptz) from anon, authenticated;
revoke execute on function public.supervisor_mark_instance_status(text,text,text) from anon, authenticated;

-- Authenticated operators retain bounded read access through RLS policies only.
grant select on table public.supervisor_instances,
                      public.supervisor_work_items,
                      public.supervisor_leases,
                      public.supervisor_coordination_events
  to authenticated;


-- ============================================================================
-- SECTION 4 of 8 — 20260718_supervisor_dispatch_ledger.sql
-- ============================================================================

-- Mission 001: durable at-most-once Supervisor dispatch claims.
-- The primary key is the cross-process and cross-region serialization boundary.

create table if not exists public.supervisor_dispatch_ledger (
  dispatch_id text primary key,
  incident_id text not null,
  executor_kind text not null check (executor_kind in ('api', 'browser', 'manual')),
  work_item_id text,
  execution_id text,
  status text not null default 'claimed' check (status in ('claimed', 'completed', 'failed', 'rejected')),
  claimed_at timestamptz not null,
  completed_at timestamptz,
  schema_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supervisor_dispatch_ledger_incident_idx
  on public.supervisor_dispatch_ledger (incident_id, claimed_at desc);

create index if not exists supervisor_dispatch_ledger_work_item_idx
  on public.supervisor_dispatch_ledger (work_item_id)
  where work_item_id is not null;

alter table public.supervisor_dispatch_ledger enable row level security;

-- Internal service-role infrastructure only. No public policies.
comment on table public.supervisor_dispatch_ledger is
  'Durable at-most-once Supervisor dispatch claims. Contains identifiers and status only; never credentials or provider payloads.';


-- ============================================================================
-- SECTION 5 of 8 — 20260717_github_universal_provider_runtime.sql
-- ============================================================================

create table if not exists public.organization_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  provider_id text not null,
  credential_ref text not null,
  status text not null default 'unknown',
  configuration_version integer not null default 1,
  disabled boolean not null default false,
  revoked boolean not null default false,
  last_validated_at timestamptz,
  validation_failure_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_id)
);
create table if not exists public.github_webhook_deliveries (
  delivery_id text primary key,
  organization_id text not null,
  event_type text not null,
  payload_hash text not null,
  status text not null,
  work_item_id text,
  received_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.github_normalized_observations (
  observation_id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  provider_id text not null default 'github',
  resource_type text not null,
  resource_id text not null,
  observation_type text not null,
  severity text not null,
  observed_state text not null,
  expected_state text,
  verification_status text not null,
  correlation_id text not null,
  trigger_source text not null,
  evidence_references jsonb not null default '[]'::jsonb,
  safe_metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  unique (organization_id, provider_id, resource_type, resource_id, observation_type, correlation_id)
);
create table if not exists public.github_schedule_state (
  organization_id text not null,
  provider_id text not null default 'github',
  resource_id text not null,
  capability_id text not null,
  window_start timestamptz not null,
  work_item_id text not null,
  retry_count integer not null default 0,
  next_attempt_at timestamptz,
  rate_limit_remaining integer,
  safe_metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, provider_id, resource_id, capability_id, window_start)
);
create index if not exists github_observations_org_type_idx on public.github_normalized_observations (organization_id, observation_type, observed_at desc);
create index if not exists github_webhook_deliveries_org_event_idx on public.github_webhook_deliveries (organization_id, event_type, received_at desc);
create index if not exists organization_provider_connections_org_status_idx on public.organization_provider_connections (organization_id, provider_id, status);


-- ============================================================================
-- SECTION 6 of 8 — 20260717_vercel_deployment_health_intelligence.sql
-- ============================================================================

create table if not exists public.vercel_deployment_health_runs (
  run_id text primary key,
  project_id text not null,
  provider_connection_id text not null,
  environment text not null check (environment in ('sandbox','preview','production')),
  status text not null check (status in ('healthy','incident_detected','read_failed','verification_failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  incident jsonb,
  plan jsonb,
  completed_step_ids text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  verification jsonb not null,
  schema_version text not null default 'vercel-deployment-health-intelligence-v1',
  created_at timestamptz not null default now()
);
create index if not exists vercel_deployment_health_runs_completed_idx on public.vercel_deployment_health_runs (completed_at desc);
create index if not exists vercel_deployment_health_runs_status_idx on public.vercel_deployment_health_runs (status, environment, completed_at desc);
alter table public.vercel_deployment_health_runs enable row level security;


-- ============================================================================
-- SECTION 7 of 8 — 20260717_vercel_deployment_health_intelligence_hardening.sql
-- ============================================================================

alter table public.vercel_deployment_health_runs
  add column if not exists approved_step_ids text[] not null default '{}',
  add column if not exists selected_channel text not null default 'api' check (selected_channel in ('api','browser','manual','none')),
  add column if not exists api_failure_category text,
  add column if not exists comparison_status text not null default 'unavailable' check (comparison_status in ('completed','unavailable','metadata-ready','comparison-pending')),
  add column if not exists governance jsonb,
  add column if not exists bpal_selections jsonb not null default '[]'::jsonb,
  add column if not exists audit_events jsonb not null default '[]'::jsonb;

alter table public.vercel_deployment_health_runs drop constraint if exists vercel_deployment_health_runs_status_check;
alter table public.vercel_deployment_health_runs
  add constraint vercel_deployment_health_runs_status_check
  check (status in ('healthy','incident_detected','read_failed','verification_failed','rejected'));

create index if not exists vercel_deployment_health_runs_work_item_idx
  on public.vercel_deployment_health_runs ((governance->>'workItemId'));
create index if not exists vercel_deployment_health_runs_channel_idx
  on public.vercel_deployment_health_runs (selected_channel, comparison_status, completed_at desc);

alter table public.vercel_deployment_health_runs enable row level security;


-- ============================================================================
-- SECTION 8 of 8 — 20260717_vercel_observation_triggers.sql
-- ============================================================================

create table if not exists public.vercel_observation_triggers (
  trigger_id text primary key,
  deduplication_key text not null unique,
  tenant_id text not null,
  provider text not null check (provider = 'vercel'),
  provider_connection_id text not null,
  project_id text not null,
  deployment_id text,
  environment text not null check (environment in ('sandbox','preview','production')),
  trigger_source text not null check (trigger_source in ('scheduled_observation','vercel_webhook','operator_requested','reconciliation')),
  event_type text,
  incident_type text,
  fingerprint text not null,
  event_time timestamptz,
  received_time timestamptz not null,
  deduplication_status text not null check (deduplication_status in ('created','reused','rejected','deferred')),
  work_item_id text,
  terminal_status text,
  reason_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vercel_observation_triggers_no_raw_payload check (not (safe_metadata ? 'rawBody') and not (safe_metadata ? 'headers') and not (safe_metadata ? 'signature'))
);
create index if not exists vercel_observation_triggers_active_idx on public.vercel_observation_triggers (provider, tenant_id, provider_connection_id, project_id, environment, deduplication_status, received_time desc);
create index if not exists vercel_observation_triggers_deployment_idx on public.vercel_observation_triggers (project_id, deployment_id, event_type, received_time desc);
alter table public.vercel_observation_triggers enable row level security;
comment on table public.vercel_observation_triggers is 'Durable sanitized trigger/deduplication ledger for read-only Vercel health observations; no raw webhook bodies, headers, signatures, secrets, or provider tokens are stored.';
