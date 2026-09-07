create table if not exists public.cos_chief_of_staff_acceptance_runs (
  id uuid primary key default gen_random_uuid(),
  profile text not null default 'chief_of_staff_reliability_v1',
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  gate_passed boolean,
  observed_cases integer not null default 0 check (observed_cases between 0 and 4),
  dimensions jsonb not null default '{}'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  error text
);

create table if not exists public.cos_chief_of_staff_acceptance_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.cos_chief_of_staff_acceptance_runs(id) on delete cascade,
  case_key text not null,
  title text not null,
  passed boolean not null,
  verdicts jsonb not null,
  response_excerpt text not null default '',
  response_source text not null,
  local_model_invoked boolean not null default false,
  external_ai_invoked boolean not null default false,
  fresh_execution boolean not null default false,
  provenance_recorded boolean not null default false,
  turn_id uuid,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, case_key)
);

create index if not exists cos_chief_of_staff_acceptance_runs_started_idx
  on public.cos_chief_of_staff_acceptance_runs(started_at desc);
create index if not exists cos_chief_of_staff_acceptance_results_run_idx
  on public.cos_chief_of_staff_acceptance_results(run_id, created_at);

alter table public.cos_chief_of_staff_acceptance_runs enable row level security;
alter table public.cos_chief_of_staff_acceptance_results enable row level security;
revoke all on table public.cos_chief_of_staff_acceptance_runs from anon, authenticated;
revoke all on table public.cos_chief_of_staff_acceptance_results from anon, authenticated;
grant select, insert, update, delete on table public.cos_chief_of_staff_acceptance_runs to service_role;
grant select, insert, update, delete on table public.cos_chief_of_staff_acceptance_results to service_role;

comment on table public.cos_chief_of_staff_acceptance_runs is 'Service-role-only durable owner COS reliability acceptance runs.';
comment on table public.cos_chief_of_staff_acceptance_results is 'Service-role-only host-scored evidence from fresh owner COS executions.';
