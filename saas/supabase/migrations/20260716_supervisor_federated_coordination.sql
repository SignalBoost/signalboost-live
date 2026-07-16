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
create policy supervisor_coordination_no_anon_instances on public.supervisor_instances for select using (auth.role() = 'authenticated');
create policy supervisor_coordination_no_anon_work on public.supervisor_work_items for select using (auth.role() = 'authenticated');
create policy supervisor_coordination_no_anon_leases on public.supervisor_leases for select using (auth.role() = 'authenticated');
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
