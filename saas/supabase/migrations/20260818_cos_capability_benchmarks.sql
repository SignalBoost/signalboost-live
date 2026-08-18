-- Private held-out COS benchmark cases and immutable run evidence. These rows are never read by
-- learning acquisition and must not be exposed through the Data API.
create table if not exists public.cos_capability_benchmark_cases (
  id uuid primary key default gen_random_uuid(),
  active boolean not null default true,
  track text not null,
  prompt text not null,
  required_terms jsonb not null default '[]'::jsonb,
  forbidden_terms jsonb not null default '[]'::jsonb,
  requires_local_reasoning boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.cos_capability_benchmark_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  requested_limit integer not null,
  attempted integer not null default 0,
  passed integer not null default 0,
  status text not null default 'running' check (status in ('running','completed','failed')),
  error text
);
create table if not exists public.cos_capability_benchmark_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cos_capability_benchmark_runs(id) on delete cascade,
  case_id uuid not null references public.cos_capability_benchmark_cases(id) on delete restrict,
  track text not null,
  passed boolean not null,
  reasons jsonb not null default '[]'::jsonb,
  response_source text,
  local_model_invoked boolean not null default false,
  external_ai_invoked boolean not null default false,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  unique(run_id, case_id)
);
create index if not exists cos_capability_benchmark_cases_active_idx on public.cos_capability_benchmark_cases(active, track);
create index if not exists cos_capability_benchmark_results_run_idx on public.cos_capability_benchmark_results(run_id, track);
alter table public.cos_capability_benchmark_cases enable row level security;
alter table public.cos_capability_benchmark_runs enable row level security;
alter table public.cos_capability_benchmark_results enable row level security;
revoke all on public.cos_capability_benchmark_cases, public.cos_capability_benchmark_runs, public.cos_capability_benchmark_results from anon, authenticated;
