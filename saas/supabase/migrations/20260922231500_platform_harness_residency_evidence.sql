-- Platform Harness + COS University Residency durable evidence.
-- Harness evidence is metadata-only. Residency evidence owns educational competency state.

create table if not exists public.platform_harness_evidence (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique,
  profile text not null,
  environment_class text not null,
  agent_id text not null,
  artifact_id text,
  artifact_hash text check (artifact_hash is null or artifact_hash ~ '^[a-f0-9]{64}$'),
  authority_manifest_ref text not null,
  outcome_status text not null,
  verifier_ref text,
  evidence_hash text,
  authority_expanded boolean not null default false check (authority_expanded is false),
  production_mutation_observed boolean not null default false,
  trajectory_evidence_refs text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.cos_university_residency_enrollments (
  id uuid primary key default gen_random_uuid(),
  artifact_row_id uuid not null references public.cos_local_distillation_artifacts(id) on delete cascade,
  candidate_id text not null,
  subject_id text not null,
  trained_artifact_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  revision_key text not null check (revision_key ~ '^[a-f0-9]{64}$'),
  program_id text not null,
  program_version text not null,
  standing text not null default 'resident'
    check (standing in ('resident','senior_resident','residency_complete','remediation_required')),
  admission_evidence_hash text not null check (admission_evidence_hash ~ '^[a-f0-9]{64}$'),
  gate_enforced boolean not null default false,
  authority_expanded boolean not null default false check (authority_expanded is false),
  admitted_at timestamptz not null default now(),
  completed_at timestamptz,
  remediation_required_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (artifact_row_id, program_id),
  unique (candidate_id, trained_artifact_hash, program_id)
);

create table if not exists public.cos_university_residency_case_runs (
  id uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.cos_university_residency_enrollments(id) on delete cascade,
  run_id text not null,
  case_family text not null,
  variant_hash text not null check (variant_hash ~ '^[a-f0-9]{64}$'),
  competency_id text not null,
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  environment_id text not null,
  status text not null check (status in ('started','passed','failed','rejected')),
  harness_outcome text,
  verifier_ref text,
  trajectory_hash text,
  evidence_hash text,
  failure_code text,
  final_exam_material_used boolean not null default false check (final_exam_material_used is false),
  authority_expanded boolean not null default false check (authority_expanded is false),
  production_mutation_observed boolean not null default false check (production_mutation_observed is false),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (residency_id, run_id),
  unique (residency_id, competency_id, variant_hash)
);

create table if not exists public.cos_university_residency_competency_evidence (
  id uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.cos_university_residency_enrollments(id) on delete cascade,
  case_run_id uuid not null references public.cos_university_residency_case_runs(id) on delete cascade,
  competency_id text not null,
  case_family text not null,
  variant_hash text not null check (variant_hash ~ '^[a-f0-9]{64}$'),
  trajectory_hash text not null check (trajectory_hash ~ '^[a-f0-9]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^[a-f0-9]{64}$'),
  outcome text not null check (outcome in ('pass','fail')),
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (residency_id, competency_id, variant_hash)
);

create index if not exists platform_harness_evidence_profile_idx
  on public.platform_harness_evidence(profile, created_at desc);
create index if not exists cos_residency_enrollment_standing_idx
  on public.cos_university_residency_enrollments(program_id, standing, updated_at desc);
create index if not exists cos_residency_case_runs_idx
  on public.cos_university_residency_case_runs(residency_id, competency_id, started_at desc);
create index if not exists cos_residency_evidence_idx
  on public.cos_university_residency_competency_evidence(residency_id, competency_id, observed_at desc);

alter table public.platform_harness_evidence enable row level security;
alter table public.cos_university_residency_enrollments enable row level security;
alter table public.cos_university_residency_case_runs enable row level security;
alter table public.cos_university_residency_competency_evidence enable row level security;

revoke all on table public.platform_harness_evidence from public, anon, authenticated;
revoke all on table public.cos_university_residency_enrollments from public, anon, authenticated;
revoke all on table public.cos_university_residency_case_runs from public, anon, authenticated;
revoke all on table public.cos_university_residency_competency_evidence from public, anon, authenticated;

grant select,insert,update,delete on table public.platform_harness_evidence to service_role;
grant select,insert,update,delete on table public.cos_university_residency_enrollments to service_role;
grant select,insert,update,delete on table public.cos_university_residency_case_runs to service_role;
grant select,insert,update,delete on table public.cos_university_residency_competency_evidence to service_role;

comment on table public.platform_harness_evidence is
  'Metadata-only durable Platform Harness evidence. No objectives, prompts, tool payloads, credentials, or hidden reasoning.';
