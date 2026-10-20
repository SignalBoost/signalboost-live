-- Per-job spend survives claims, process loss, and terminal-result writes.
create table public.builder_inference_budgets (
  job_id uuid primary key references public.builder_jobs(id) on delete cascade,
  user_id uuid not null,
  cap_nanos bigint not null check (cap_nanos > 0),
  reserved_nanos bigint not null default 0 check (reserved_nanos >= 0),
  accounted_nanos bigint not null default 0 check (accounted_nanos >= 0),
  deadline_at timestamptz not null,
  call_count integer not null default 0,
  blocked boolean not null default false
);
create table public.builder_inference_reservations (
  call_id uuid primary key,
  job_id uuid not null references public.builder_inference_budgets(job_id) on delete cascade,
  upper_nanos bigint not null check (upper_nanos > 0),
  accounted_nanos bigint,
  reported_nanos bigint,
  settled boolean not null default false,
  quote jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.builder_inference_budgets enable row level security;
alter table public.builder_inference_reservations enable row level security;
revoke all on public.builder_inference_budgets, public.builder_inference_reservations from public, anon, authenticated;
grant select, insert, update on public.builder_inference_budgets, public.builder_inference_reservations to service_role;

create function public.reserve_builder_inference(
  p_job_id uuid, p_user_id uuid, p_generation integer, p_call_id uuid, p_upper_nanos bigint, p_quote jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  j public.builder_jobs%rowtype;
  b public.builder_inference_budgets%rowtype;
  cap bigint;
  elapsed_ms bigint;
begin
  select * into j from public.builder_jobs where id=p_job_id and user_id=p_user_id for update;
  if not found or j.status is distinct from 'running' or j.claim_generation is distinct from p_generation
    or j.job_kind is distinct from 'standard' or j.metadata->>'builderEngine' is distinct from 'v2' then
    raise exception 'builder_budget_lease_lost';
  end if;
  cap := (j.metadata->'builderRunLimits'->>'maxCostNanodollars')::bigint;
  elapsed_ms := (j.metadata->'builderRunLimits'->>'maxElapsedMs')::bigint;
  if cap is null or cap <= 0 or cap > 100000000000 or elapsed_ms is null or elapsed_ms <= 0 or elapsed_ms > 3600000
    or p_upper_nanos is null or p_upper_nanos <= 0 or p_quote is null then
    raise exception 'builder_budget_limits_invalid';
  end if;
  insert into public.builder_inference_budgets(job_id,user_id,cap_nanos,deadline_at)
    values(p_job_id,p_user_id,cap,j.created_at + elapsed_ms * interval '1 millisecond') on conflict(job_id) do nothing;
  select * into b from public.builder_inference_budgets where job_id=p_job_id for update;
  if b.user_id <> p_user_id or b.cap_nanos <> cap
    or b.deadline_at <> j.created_at + elapsed_ms * interval '1 millisecond' then
    raise exception 'builder_budget_limits_changed';
  end if;
  if clock_timestamp() >= b.deadline_at then return jsonb_build_object('reserved',false,'reason','builder_budget_time_exhausted'); end if;
  if b.blocked or b.accounted_nanos + b.reserved_nanos + p_upper_nanos > b.cap_nanos then
    return jsonb_build_object('reserved',false,'reason','builder_budget_exhausted');
  end if;
  -- Duplicate call IDs are denied, not replay grants. A lost RPC response cannot authorize a second HTTP call.
  insert into public.builder_inference_reservations(call_id,job_id,upper_nanos,quote)
    values(p_call_id,p_job_id,p_upper_nanos,p_quote);
  update public.builder_inference_budgets set reserved_nanos=reserved_nanos+p_upper_nanos,call_count=call_count+1 where job_id=p_job_id;
  return jsonb_build_object('reserved',true);
end $$;

create function public.settle_builder_inference(
  p_job_id uuid, p_user_id uuid, p_call_id uuid, p_accounted_nanos bigint, p_reported_nanos bigint
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  b public.builder_inference_budgets%rowtype;
  r public.builder_inference_reservations%rowtype;
begin
  select * into b from public.builder_inference_budgets where job_id=p_job_id and user_id=p_user_id for update;
  if not found then raise exception 'builder_budget_identity_invalid'; end if;
  select * into r from public.builder_inference_reservations where call_id=p_call_id and job_id=p_job_id for update;
  if not found then raise exception 'builder_budget_reservation_missing'; end if;
  if r.settled then return jsonb_build_object('blocked',b.blocked); end if;
  if p_accounted_nanos < 0 or p_reported_nanos < 0 then raise exception 'builder_budget_usage_invalid'; end if;
  update public.builder_inference_reservations set settled=true,accounted_nanos=p_accounted_nanos,reported_nanos=p_reported_nanos where call_id=p_call_id;
  if p_accounted_nanos is not null then
    update public.builder_inference_budgets set reserved_nanos=reserved_nanos-r.upper_nanos,
      accounted_nanos=accounted_nanos+p_accounted_nanos,blocked=blocked or p_accounted_nanos>r.upper_nanos
      where job_id=p_job_id;
  end if;
  return jsonb_build_object('blocked',b.blocked or coalesce(p_accounted_nanos>r.upper_nanos,false));
end $$;
revoke all on function public.reserve_builder_inference(uuid,uuid,integer,uuid,bigint,jsonb) from public, anon, authenticated;
revoke all on function public.settle_builder_inference(uuid,uuid,uuid,bigint,bigint) from public, anon, authenticated;
grant execute on function public.reserve_builder_inference(uuid,uuid,integer,uuid,bigint,jsonb) to service_role;
grant execute on function public.settle_builder_inference(uuid,uuid,uuid,bigint,bigint) to service_role;
