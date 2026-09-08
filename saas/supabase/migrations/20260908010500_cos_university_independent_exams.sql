-- Host-controlled COS University unseen examinations.
--
-- This table stores only server-side exam identity, target, seed/hash, provenance, and verdict.
-- Prompts, hidden rubrics, and model replies are intentionally not persisted here. Academic grades
-- remain derived from cos_university_assessments; an exam run can only contribute pass/fail evidence.

create table if not exists public.cos_university_exam_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  profile text not null,
  scorer_version text not null,
  seed text not null,
  manifest_hash text not null,
  target_kind text not null check (target_kind in ('subject','language')),
  subject_id text,
  language_code text,
  language_dimension text,
  assessment_kind text not null default 'unseen_subject_exam'
    check (assessment_kind in ('unseen_subject_exam')),
  status text not null default 'created'
    check (status in ('created','running','passed','failed','error')),
  passed boolean,
  turn_id uuid,
  response_source text,
  local_model_invoked boolean not null default false,
  external_ai_invoked boolean not null default false,
  fresh_execution boolean not null default false,
  provenance_recorded boolean not null default false,
  reasons text[] not null default '{}'::text[],
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (target_kind = 'subject' and subject_id is not null and language_code is null and language_dimension is null)
    or
    (target_kind = 'language' and subject_id is null and language_code is not null and language_dimension is not null)
  ),
  check (subject_id is null or subject_id in (
    'computer_science','mathematics','statistics_data_science','physics_natural_sciences','cybersecurity',
    'politics_government_international_relations','social_behavioral_sciences','economics_finance',
    'business_operations','law_regulation_governance','language_communication',
    'history_culture_philosophy_religion','reasoning_decision_science'
  )),
  check (language_code is null or language_code in ('en','es','pt','pl','ru')),
  check (language_dimension is null or language_dimension in (
    'comprehension','writing','instruction_following','translation_localization','cultural_pragmatics'
  )),
  check ((status in ('passed','failed')) = (passed is not null)),
  check (status <> 'passed' or passed = true),
  check (status <> 'failed' or passed = false)
);

create index if not exists cos_university_exam_runs_target_idx
  on public.cos_university_exam_runs(target_kind, subject_id, language_code, language_dimension, created_at desc);
create index if not exists cos_university_exam_runs_status_idx
  on public.cos_university_exam_runs(status, created_at desc);

comment on table public.cos_university_exam_runs is
  'Service-only host-controlled University exam ledger. Seeded blind exam identity and verdict only; hidden rubric/prompt/reply are not persisted and learner self-assessment cannot create a pass.';
comment on column public.cos_university_exam_runs.manifest_hash is
  'Hash of the deterministic server-generated exam manifest for drift/audit detection without storing the hidden rubric.';

alter table public.cos_university_exam_runs enable row level security;
revoke all on public.cos_university_exam_runs from anon, authenticated;
grant select, insert, update, delete on public.cos_university_exam_runs to service_role;
