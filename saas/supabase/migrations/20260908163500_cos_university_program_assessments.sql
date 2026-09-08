-- Generic graduate/program academic evidence ledger.
--
-- This extends COS University without creating a second learning engine. Study, practice, cognitive
-- skills, specialist routing, and Production outcomes remain in their existing systems. This table
-- records only host-controlled academic evidence for named program competencies.

create table if not exists public.cos_university_program_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_key text not null unique,
  agent_id text not null default 'cos',
  program_key text not null,
  program_level text not null check (program_level in ('masters','phd','professional_certificate')),
  specialist_family text not null,
  competency_key text not null,
  assessment_stage text not null check (assessment_stage in (
    'qualifying_exam','applied_transfer','production_transfer','distinction','capstone'
  )),
  passed boolean not null,
  independent_scorer boolean not null default false,
  scorer_version text not null,
  scorer_authority text not null check (scorer_authority in (
    'host_private_exam','verified_production','host_capstone'
  )),
  source_ref text,
  variant_hash text,
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  check (valid_until > observed_at),
  check (assessment_stage <> 'production_transfer' or scorer_authority = 'verified_production'),
  check (assessment_stage <> 'capstone' or scorer_authority = 'host_capstone'),
  check (assessment_stage not in ('qualifying_exam','applied_transfer','distinction') or scorer_authority = 'host_private_exam')
);

create index if not exists cos_university_program_assessments_program_idx
  on public.cos_university_program_assessments(agent_id, program_key, competency_key, observed_at desc);
create index if not exists cos_university_program_assessments_fresh_idx
  on public.cos_university_program_assessments(agent_id, program_key, valid_until desc);

alter table public.cos_university_program_assessments enable row level security;
revoke all on table public.cos_university_program_assessments from anon, authenticated;
grant select, insert, update, delete on table public.cos_university_program_assessments to service_role;

comment on table public.cos_university_program_assessments is
  'Host-owned graduate/program academic evidence. Learning activity, corpus volume, specialist lifecycle status, or model self-assessment cannot write a degree grade by themselves.';
comment on column public.cos_university_program_assessments.competency_key is
  'Versioned program-owned competency identifier. It is academic evidence scope, not an execution permission.';
comment on column public.cos_university_program_assessments.variant_hash is
  'Opaque host-side variant identity used to prove materially distinct passes without storing hidden prompts or rubrics.';
