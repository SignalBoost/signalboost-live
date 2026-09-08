-- COS University A-range evidence ledger.
-- Stores transfer / verified Production / capstone run identity and provenance only.
-- Raw prompts, hidden rubrics, raw model replies, and caller-supplied grades are intentionally absent.

create table if not exists public.cos_university_a_range_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  agent_id text not null default 'cos',
  stage text not null check (stage in ('cross_domain_transfer', 'production_transfer', 'capstone')),
  subject_id text not null check (subject_id in (
    'computer_science',
    'mathematics',
    'statistics_data_science',
    'physics_natural_sciences',
    'cybersecurity',
    'politics_government_international_relations',
    'social_behavioral_sciences',
    'economics_finance',
    'business_operations',
    'law_regulation_governance',
    'language_communication',
    'history_culture_philosophy_religion',
    'reasoning_decision_science'
  )),
  profile text not null,
  scorer_version text not null,
  seed text,
  manifest_hash text not null,
  variant_hash text not null,
  source_ref text,
  status text not null default 'created' check (status in ('created', 'running', 'passed', 'failed', 'error')),
  passed boolean,
  turn_id uuid,
  response_source text,
  local_model_invoked boolean not null default false,
  external_ai_invoked boolean not null default false,
  fresh_execution boolean not null default false,
  reasons text[] not null default '{}'::text[],
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  observed_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cos_university_a_range_seed_boundary check (
    (stage = 'production_transfer' and seed is null)
    or (stage <> 'production_transfer' and seed is not null)
  ),
  constraint cos_university_a_range_terminal_boundary check (
    (status in ('passed', 'failed') and passed is not null)
    or (status not in ('passed', 'failed'))
  )
);

create index if not exists cos_university_a_range_subject_stage_idx
  on public.cos_university_a_range_runs (agent_id, subject_id, stage, observed_at desc);
create index if not exists cos_university_a_range_turn_idx
  on public.cos_university_a_range_runs (turn_id)
  where turn_id is not null;
create index if not exists cos_university_a_range_variant_idx
  on public.cos_university_a_range_runs (agent_id, subject_id, stage, variant_hash)
  where passed is true;

alter table public.cos_university_a_range_runs enable row level security;
revoke all on table public.cos_university_a_range_runs from anon, authenticated;
grant select, insert, update, delete on table public.cos_university_a_range_runs to service_role;
