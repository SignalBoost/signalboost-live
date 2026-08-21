-- Durable COS turn outcomes + controlled evidence-utilization benchmark.
--
-- Outcome writes are deliberately independent from cos_turn_experience because that telemetry is
-- persisted after the HTTP response. A benchmark can know the outcome before that insert exists.
-- turn_id is the stable correlation key; no raw prompt or answer text is stored in cos_turn_outcomes.

create table if not exists public.cos_turn_outcomes (
  turn_id uuid primary key,
  repair_needed boolean,
  escalated boolean,
  user_feedback text,
  verified_success boolean,
  outcome_at timestamptz not null default now(),
  outcome_source text not null,
  updated_at timestamptz not null default now()
);

create index if not exists cos_turn_outcomes_outcome_at_idx
  on public.cos_turn_outcomes(outcome_at desc);
create index if not exists cos_turn_outcomes_verified_idx
  on public.cos_turn_outcomes(verified_success, outcome_at desc)
  where verified_success is not null;

comment on table public.cos_turn_outcomes is
  'Outcome state keyed by COS reasoner turn_id. Independent from post-response execution telemetry so feedback, benchmarks and verified production outcomes cannot race the turn insert.';

alter table public.cos_turn_outcomes enable row level security;
revoke all on public.cos_turn_outcomes from anon, authenticated;

create or replace function public.cos_merge_turn_outcome(
  p_turn_id uuid,
  p_repair_needed boolean default null,
  p_escalated boolean default null,
  p_user_feedback text default null,
  p_verified_success boolean default null,
  p_outcome_source text default 'unknown',
  p_outcome_at timestamptz default now()
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.cos_turn_outcomes (
    turn_id,
    repair_needed,
    escalated,
    user_feedback,
    verified_success,
    outcome_at,
    outcome_source,
    updated_at
  ) values (
    p_turn_id,
    p_repair_needed,
    p_escalated,
    left(nullif(trim(p_user_feedback), ''), 400),
    p_verified_success,
    coalesce(p_outcome_at, now()),
    left(coalesce(nullif(trim(p_outcome_source), ''), 'unknown'), 120),
    now()
  )
  on conflict (turn_id) do update set
    repair_needed = coalesce(excluded.repair_needed, cos_turn_outcomes.repair_needed),
    escalated = coalesce(excluded.escalated, cos_turn_outcomes.escalated),
    user_feedback = coalesce(excluded.user_feedback, cos_turn_outcomes.user_feedback),
    verified_success = coalesce(excluded.verified_success, cos_turn_outcomes.verified_success),
    outcome_at = excluded.outcome_at,
    outcome_source = excluded.outcome_source,
    updated_at = now();
end;
$$;

revoke all on function public.cos_merge_turn_outcome(uuid, boolean, boolean, text, boolean, text, timestamptz) from public;
grant execute on function public.cos_merge_turn_outcome(uuid, boolean, boolean, text, boolean, text, timestamptz) to service_role;

-- Trace ordinary held-out capability results back to the exact reasoner turn.
alter table public.cos_capability_benchmark_results
  add column if not exists turn_id uuid;
create index if not exists cos_capability_benchmark_results_turn_idx
  on public.cos_capability_benchmark_results(turn_id)
  where turn_id is not null;

-- Separate controlled suite: these cases are not the six private capability-acceptance cases.
create table if not exists public.cos_evidence_utilization_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  requested_limit integer not null default 2 check (requested_limit between 1 and 4),
  attempted integer not null default 0 check (attempted >= 0),
  passed integer not null default 0 check (passed >= 0),
  status text not null default 'running' check (status in ('running','completed','failed')),
  error text
);

create table if not exists public.cos_evidence_utilization_benchmark_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cos_evidence_utilization_benchmark_runs(id) on delete cascade,
  case_id text not null,
  domain text not null,
  passed boolean not null,
  reasons text[] not null default '{}'::text[],
  turn_id uuid,
  response_excerpt text not null default '',
  latency_ms integer not null default 0 check (latency_ms >= 0),
  created_at timestamptz not null default now(),
  unique(run_id, case_id)
);

create index if not exists cos_evidence_utilization_benchmark_runs_started_idx
  on public.cos_evidence_utilization_benchmark_runs(started_at desc);
create index if not exists cos_evidence_utilization_benchmark_results_turn_idx
  on public.cos_evidence_utilization_benchmark_results(turn_id)
  where turn_id is not null;
create index if not exists cos_evidence_utilization_benchmark_results_domain_idx
  on public.cos_evidence_utilization_benchmark_results(domain, created_at desc);

alter table public.cos_evidence_utilization_benchmark_runs enable row level security;
alter table public.cos_evidence_utilization_benchmark_results enable row level security;
revoke all on public.cos_evidence_utilization_benchmark_runs from anon, authenticated;
revoke all on public.cos_evidence_utilization_benchmark_results from anon, authenticated;

comment on table public.cos_evidence_utilization_benchmark_runs is
  'Owner-only controlled benchmark runs used to accumulate evidence-utilization and outcome data without modifying the private capability-acceptance suite.';
comment on table public.cos_evidence_utilization_benchmark_results is
  'Controlled evidence-utilization benchmark results correlated to reasoner turn_id. Source-use details remain in cos_evidence_source_use.';
