-- COS University Residency v1.
-- Residency is practical competency development after academic promotion/runtime proof.
-- It records competence; it never grants Production authority.

create table if not exists public.cos_university_residency_enrollments (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.cos_university_graduate_model_registry(id) on delete cascade,
  candidate_id text not null,
  subject_id text not null,
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  program_id text not null,
  program_version text not null,
  standing text not null default 'resident'
    check (standing in ('resident','senior_resident','residency_complete','remediation_required')),
  admission_evidence_hash text not null check (admission_evidence_hash ~ '^[a-f0-9]{64}$'),
  authority_expanded boolean not null default false check (authority_expanded is false),
  admitted_at timestamptz not null default now(),
  completed_at timestamptz,
  remediation_required_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (registry_id, program_id),
  unique (candidate_id, trained_artifact_hash, program_id)
);

create table if not exists public.cos_university_residency_competency_evidence (
  id uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.cos_university_residency_enrollments(id) on delete cascade,
  competency_id text not null,
  case_id text not null,
  case_fingerprint text not null check (case_fingerprint ~ '^[a-f0-9]{64}$'),
  evidence_ref text not null,
  verifier text not null check (verifier in ('host_production_verifier','independent_scorer')),
  outcome text not null check (outcome in ('pass','fail')),
  exact_artifact boolean not null default true check (exact_artifact is true),
  independently_verified boolean not null default true check (independently_verified is true),
  authority_expanded boolean not null default false check (authority_expanded is false),
  observed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (residency_id, competency_id, case_fingerprint)
);

create index if not exists cos_university_residency_enrollments_standing_idx
  on public.cos_university_residency_enrollments (program_id, standing, updated_at desc);

create index if not exists cos_university_residency_competency_evidence_idx
  on public.cos_university_residency_competency_evidence (residency_id, competency_id, observed_at desc);

alter table public.cos_university_residency_enrollments enable row level security;
alter table public.cos_university_residency_competency_evidence enable row level security;

revoke all on table public.cos_university_residency_enrollments from public, anon, authenticated;
revoke all on table public.cos_university_residency_competency_evidence from public, anon, authenticated;
grant select, insert, update, delete on table public.cos_university_residency_enrollments to service_role;
grant select, insert, update, delete on table public.cos_university_residency_competency_evidence to service_role;

comment on table public.cos_university_residency_enrollments is
  'Formal COS University practical residency enrollment. Academic qualification and runtime proof admit a resident; residency standing does not expand authority.';
comment on table public.cos_university_residency_competency_evidence is
  'Exact-artifact, independently verified practical competency evidence. Duplicate case fingerprints cannot manufacture competence.';
