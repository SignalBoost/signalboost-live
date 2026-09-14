-- Durable, service-only summaries for exact distilled-model evaluation runs.
-- Raw prompts, responses, credentials and hidden reasoning are intentionally never stored.

create table if not exists public.cos_university_distilled_evaluation_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check (run_key ~ '^[a-f0-9]{64}$'),
  candidate_id text not null,
  subject_id text not null,
  trained_artifact_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  revision_key text not null check (revision_key ~ '^[a-f0-9]{64}$'),
  endpoint_id text not null,
  evaluator_id text not null,
  evaluator_version text not null,
  holdout_suite_hash text not null check (holdout_suite_hash ~ '^[a-f0-9]{64}$'),
  safety_suite_hash text not null check (safety_suite_hash ~ '^[a-f0-9]{64}$'),
  transfer_suite_hash text not null check (transfer_suite_hash ~ '^[a-f0-9]{64}$'),
  retention_suite_hash text not null check (retention_suite_hash ~ '^[a-f0-9]{64}$'),
  holdout_manifest_hash text not null check (holdout_manifest_hash ~ '^[a-f0-9]{64}$'),
  holdout_case_count integer not null check (holdout_case_count > 0 and holdout_case_count <= 100),
  baseline_score double precision not null check (baseline_score between 0 and 1),
  trained_artifact_score double precision not null check (trained_artifact_score between 0 and 1),
  safety_score double precision not null check (safety_score between 0 and 1),
  transfer_baseline_score double precision not null check (transfer_baseline_score between 0 and 1),
  transfer_artifact_score double precision not null check (transfer_artifact_score between 0 and 1),
  retention_baseline_score double precision not null check (retention_baseline_score between 0 and 1),
  retention_artifact_score double precision not null check (retention_artifact_score between 0 and 1),
  artifact_age_seconds bigint not null check (artifact_age_seconds >= 0),
  holdout_improved boolean not null,
  safety_passed boolean not null,
  unseen_transfer_passed boolean not null,
  delayed_retention_passed boolean not null,
  response_hashes jsonb not null default '{}'::jsonb,
  authority_expanded boolean not null default false check (authority_expanded is false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(response_hashes) = 'object')
);

create index if not exists cos_distilled_evaluation_runs_candidate_idx
  on public.cos_university_distilled_evaluation_runs (candidate_id, created_at desc);

alter table public.cos_university_distilled_evaluation_runs enable row level security;
revoke all on table public.cos_university_distilled_evaluation_runs from public, anon, authenticated;
grant select, insert, update on table public.cos_university_distilled_evaluation_runs to service_role;

comment on table public.cos_university_distilled_evaluation_runs is
  'Independent distilled-model evaluation summaries. Stores hashes and scores only; promotion still requires separately admitted claims and Production canary evidence.';
