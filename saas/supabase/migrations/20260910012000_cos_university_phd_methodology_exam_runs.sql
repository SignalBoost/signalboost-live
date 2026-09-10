-- Host-controlled COS University PhD methodology-exam execution ledger.
-- Stores seeded exam identity, scoring/provenance metadata, and durable outcome only.
-- Raw prompts, hidden rubrics, and candidate replies are deliberately not stored here.

create table if not exists public.cos_university_phd_methodology_exam_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check (length(btrim(run_key)) > 0),
  agent_id text not null default 'cos',
  program_key text not null,
  program_id text not null check (program_id in (
    'ai_systems_research','security_trust_research','quantitative_methods_research',
    'enterprise_systems_research','physical_systems_research'
  )),
  research_project_id text not null check (length(btrim(research_project_id)) > 0),
  protocol_id text not null check (length(btrim(protocol_id)) > 0),
  candidate_actor_id text not null check (length(btrim(candidate_actor_id)) > 0),
  evaluator_actor_id text not null check (length(btrim(evaluator_actor_id)) > 0),
  profile text not null check (profile = 'cos_university_phd_methodology_v1'),
  scorer_version text not null check (scorer_version = 'phd-methodology-host-scorer-v1'),
  seed text not null check (length(btrim(seed)) > 0),
  manifest_hash text not null check (length(btrim(manifest_hash)) > 0),
  variant_hash text not null check (length(btrim(variant_hash)) > 0),
  status text not null default 'created' check (status in ('created','running','passed','failed','error')),
  passed boolean,
  reasons text[] not null default '{}'::text[],
  turn_id text,
  response_source text,
  local_model_invoked boolean,
  external_ai_invoked boolean,
  fresh_execution boolean not null default false,
  evidence_recorded boolean not null default false,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  observed_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cos_university_phd_methodology_program_identity check (
    program_key = 'specialist_phd_' || program_id || '_v1'
  ),
  constraint cos_university_phd_methodology_terminal_truth check (
    (status in ('created','running') and passed is null and evidence_recorded = false)
    or (status = 'error' and passed is null)
    or (status = 'passed' and passed = true and evidence_recorded = true and fresh_execution = true)
    or (status = 'failed' and passed = false and evidence_recorded = true and fresh_execution = true)
  )
);

create index if not exists cos_university_phd_methodology_program_idx
  on public.cos_university_phd_methodology_exam_runs
  (agent_id, program_key, research_project_id, protocol_id, observed_at desc);

alter table public.cos_university_phd_methodology_exam_runs enable row level security;
revoke all on table public.cos_university_phd_methodology_exam_runs from anon, authenticated, service_role;
grant select, insert, update on table public.cos_university_phd_methodology_exam_runs to service_role;

comment on table public.cos_university_phd_methodology_exam_runs is
  'Service-only host-seeded PhD methodology exam runs. Stores no raw prompt, hidden rubric, candidate reply, or degree flag.';
