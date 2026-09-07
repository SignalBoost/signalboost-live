create table if not exists public.concierge_language_acceptance_runs (
  id uuid primary key default gen_random_uuid(),
  profile text not null default 'concierge_native_language_v1',
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  automated_gate_passed boolean,
  full_gate_passed boolean not null default false,
  observed_cases integer not null default 0 check (observed_cases between 0 and 25),
  language_summary jsonb not null default '{}'::jsonb,
  native_reviews jsonb not null default '{"en":"pending","es":"pending","pt":"pending","pl":"pending","ru":"pending"}'::jsonb,
  native_review_notes jsonb not null default '{}'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  error text
);

create table if not exists public.concierge_language_acceptance_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.concierge_language_acceptance_runs(id) on delete cascade,
  case_key text not null,
  title text not null,
  language text not null check (language in ('en','es','pt','pl','ru')),
  category text not null check (category in ('conversation','operational','transformation','reasoning','fallback')),
  passed boolean not null,
  verdicts jsonb not null,
  response_excerpt text not null default '',
  response_source text not null,
  local_model_invoked boolean not null default false,
  external_ai_invoked boolean not null default false,
  native_reviewer_used boolean not null default false,
  native_review_confidence double precision,
  critical_tokens jsonb not null default '[]'::jsonb,
  latency_ms integer not null default 0,
  created_at timestamptz not null default now(),
  unique (run_id, case_key)
);

create index if not exists concierge_language_acceptance_runs_started_idx
  on public.concierge_language_acceptance_runs(started_at desc);
create index if not exists concierge_language_acceptance_results_run_idx
  on public.concierge_language_acceptance_results(run_id, created_at);

alter table public.concierge_language_acceptance_runs enable row level security;
alter table public.concierge_language_acceptance_results enable row level security;
revoke all on table public.concierge_language_acceptance_runs from anon, authenticated;
revoke all on table public.concierge_language_acceptance_results from anon, authenticated;
grant select, insert, update, delete on table public.concierge_language_acceptance_runs to service_role;
grant select, insert, update, delete on table public.concierge_language_acceptance_results to service_role;

comment on table public.concierge_language_acceptance_runs is 'Service-role-only durable five-language Concierge acceptance runs; automated and human-native gates are separate.';
comment on table public.concierge_language_acceptance_results is 'Service-role-only per-case evidence for Concierge language, routing, token-preservation, and latency acceptance.';
