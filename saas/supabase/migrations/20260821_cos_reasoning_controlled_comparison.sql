-- Controlled COS reasoning comparisons.
--
-- These tables record owner-triggered held-out A/B evaluations only. They do not contain raw prompt
-- or full answer text. Verified quality remains authoritative in cos_turn_outcomes; worker/model
-- execution cost and latency remain authoritative in cos_reasoning_worker_metrics.

create table if not exists public.cos_reasoning_comparison_runs (
  id uuid primary key default gen_random_uuid(),
  case_id text not null,
  candidate_roles text[] not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  attempted integer not null default 0 check (attempted >= 0),
  verified integer not null default 0 check (verified >= 0),
  passed integer not null default 0 check (passed >= 0),
  status text not null default 'running' check (status in ('running','completed','failed')),
  error text
);

create table if not exists public.cos_reasoning_comparison_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cos_reasoning_comparison_runs(id) on delete cascade,
  case_id text not null,
  track text not null,
  candidate_id text not null,
  worker_role text not null check (worker_role in ('primary','coder','critic','verifier','researcher')),
  reasoner_label text,
  passed boolean not null default false,
  reasons text[] not null default '{}'::text[],
  turn_id uuid,
  latency_ms integer not null default 0 check (latency_ms >= 0),
  verified_outcome_recorded boolean not null default false,
  created_at timestamptz not null default now(),
  unique(run_id, case_id, candidate_id)
);

create index if not exists cos_reasoning_comparison_runs_started_idx
  on public.cos_reasoning_comparison_runs(started_at desc);
create index if not exists cos_reasoning_comparison_results_candidate_idx
  on public.cos_reasoning_comparison_results(case_id, worker_role, reasoner_label, created_at desc);
create index if not exists cos_reasoning_comparison_results_turn_idx
  on public.cos_reasoning_comparison_results(turn_id)
  where turn_id is not null;

comment on table public.cos_reasoning_comparison_runs is
  'Owner-triggered controlled A/B reasoning evaluations. Runs are bounded and never scheduled from ordinary production traffic.';
comment on table public.cos_reasoning_comparison_results is
  'Per-candidate held-out comparison results correlated to the worker metric and verified outcome by turn_id; no raw prompt or full answer is persisted.';

alter table public.cos_reasoning_comparison_runs enable row level security;
alter table public.cos_reasoning_comparison_results enable row level security;
revoke all on public.cos_reasoning_comparison_runs from anon, authenticated;
revoke all on public.cos_reasoning_comparison_results from anon, authenticated;
