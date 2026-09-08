alter table public.cos_university_study_plans
  add column if not exists academic_level text not null default 'undergraduate',
  add column if not exists program_key text,
  add column if not exists module_key text;

alter table public.cos_university_study_plans
  drop constraint if exists cos_university_study_plans_academic_level_check;
alter table public.cos_university_study_plans
  add constraint cos_university_study_plans_academic_level_check
  check (academic_level in ('undergraduate','masters'));

alter table public.cos_university_study_plans
  drop constraint if exists cos_university_study_plans_program_scope_check;
alter table public.cos_university_study_plans
  add constraint cos_university_study_plans_program_scope_check
  check (
    (academic_level = 'undergraduate' and program_key is null and module_key is null)
    or (
      academic_level = 'masters'
      and program_key like 'specialist_masters_%_v1'
      and length(btrim(module_key)) > 0
    )
  );

create index if not exists cos_university_study_plans_masters_program_idx
  on public.cos_university_study_plans (agent_id, academic_level, program_key, status, priority desc, created_at asc);

alter table public.cos_university_masters_evidence
  add column if not exists module_key text;

alter table public.cos_university_masters_evidence
  drop constraint if exists cos_university_masters_evidence_module_scope_check;
alter table public.cos_university_masters_evidence
  add constraint cos_university_masters_evidence_module_scope_check
  check (
    (stage = 'graduate_coursework' and module_key is not null and length(btrim(module_key)) > 0)
    or (stage <> 'graduate_coursework' and module_key is null)
  );

create table if not exists public.cos_university_masters_learning_runs (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique,
  agent_id text not null default 'cos',
  program_key text not null,
  program_id text not null check (program_id in (
    'applied_ai_systems','security_and_trust','quantitative_decision_science',
    'enterprise_operations_and_governance','scientific_and_physical_systems'
  )),
  status text not null default 'running' check (status in ('running','completed','error')),
  plans_considered integer not null default 0 check (plans_considered >= 0),
  plans_attempted integer not null default 0 check (plans_attempted >= 0),
  documents_acquired integer not null default 0 check (documents_acquired >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint cos_university_masters_learning_program_identity check (
    program_key = 'specialist_masters_' || program_id || '_v1'
  )
);

create index if not exists cos_university_masters_learning_runs_program_idx
  on public.cos_university_masters_learning_runs (agent_id, program_key, started_at desc);

alter table public.cos_university_masters_learning_runs enable row level security;
revoke all on table public.cos_university_masters_learning_runs from anon, authenticated, service_role;
grant select, insert, update, delete on table public.cos_university_masters_learning_runs to service_role;

comment on table public.cos_university_masters_learning_runs is
  'Service-only bounded Master''s learning-sweep ledger. Stores orchestration counts only, no lesson body, exam prompt, rubric, reply, or grade.';

create table if not exists public.cos_university_masters_exam_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  agent_id text not null default 'cos',
  program_key text not null,
  program_id text not null check (program_id in (
    'applied_ai_systems','security_and_trust','quantitative_decision_science',
    'enterprise_operations_and_governance','scientific_and_physical_systems'
  )),
  module_key text,
  stage text not null check (stage in (
    'graduate_coursework','independent_specialist_exam','cross_domain_transfer','masters_capstone'
  )),
  profile text not null,
  scorer_version text not null,
  seed text not null,
  manifest_hash text not null,
  variant_hash text not null,
  status text not null default 'created' check (status in ('created','running','passed','failed','error')),
  passed boolean,
  turn_id text,
  response_source text,
  local_model_invoked boolean not null default false,
  external_ai_invoked boolean not null default false,
  fresh_execution boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  latency_ms integer,
  observed_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint cos_university_masters_exam_program_identity check (
    program_key = 'specialist_masters_' || program_id || '_v1'
  ),
  constraint cos_university_masters_exam_module_scope check (
    (stage = 'graduate_coursework' and module_key is not null and length(btrim(module_key)) > 0)
    or (stage <> 'graduate_coursework' and module_key is null)
  ),
  constraint cos_university_masters_exam_terminal_pass check (
    (status in ('created','running','error') and passed is null)
    or (status = 'passed' and passed is true)
    or (status = 'failed' and passed is false)
  )
);

create index if not exists cos_university_masters_exam_runs_program_idx
  on public.cos_university_masters_exam_runs (agent_id, program_key, stage, observed_at desc);

alter table public.cos_university_masters_exam_runs enable row level security;
revoke all on table public.cos_university_masters_exam_runs from anon, authenticated, service_role;
grant select, insert, update, delete on table public.cos_university_masters_exam_runs to service_role;

comment on table public.cos_university_masters_exam_runs is
  'Service-only hidden-seed Master''s coursework/exam run ledger. Stores manifest/provenance/verdict metadata, never raw prompt, hidden rubric, or learner reply.';
