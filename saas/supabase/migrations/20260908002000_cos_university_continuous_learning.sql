-- COS University durable academic evidence + continuous-learning plans.
--
-- Academic grades are derived only from fresh, independently scored assessment evidence.
-- Operational failures and ordinary study may create/remediate study plans, but can never write a
-- passing academic grade by themselves. All tables are service-only and RLS-protected.

create table if not exists public.cos_university_assessments (
  id uuid primary key default gen_random_uuid(),
  assessment_key text not null unique,
  agent_id text not null default 'cos',
  subject_id text,
  language_code text,
  language_dimension text,
  assessment_kind text not null check (assessment_kind in (
    'diagnostic','practice_checkpoint','unseen_subject_exam','cross_domain_transfer','production_transfer','capstone'
  )),
  passed boolean not null,
  independent_scorer boolean not null default false,
  scorer_version text not null,
  scorer_authority text not null check (scorer_authority in (
    'host_private_exam','verified_production','host_capstone'
  )),
  source_ref text,
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  check (valid_until > observed_at),
  check (
    (subject_id is not null and language_code is null and language_dimension is null)
    or
    (subject_id is null and language_code is not null and language_dimension is not null)
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
  check (assessment_kind <> 'production_transfer' or scorer_authority = 'verified_production'),
  check (assessment_kind <> 'capstone' or scorer_authority = 'host_capstone')
);

create index if not exists cos_university_assessments_subject_idx
  on public.cos_university_assessments(agent_id, subject_id, observed_at desc)
  where subject_id is not null;
create index if not exists cos_university_assessments_language_idx
  on public.cos_university_assessments(agent_id, language_code, language_dimension, observed_at desc)
  where language_code is not null;
create index if not exists cos_university_assessments_valid_idx
  on public.cos_university_assessments(agent_id, valid_until desc);

comment on table public.cos_university_assessments is
  'Host-owned academic evidence ledger. Ordinary ingestion, embeddings, self-confidence, operational metrics, or cognitive-skill lifecycle status never constitute a university grade.';
comment on column public.cos_university_assessments.scorer_authority is
  'Independent assessment authority. production_transfer requires verified_production and capstone requires host_capstone.';
comment on column public.cos_university_assessments.valid_until is
  'Host-defined recertification boundary. Transcript readers compute freshness from this timestamp rather than trusting a learner-supplied fresh flag.';

create table if not exists public.cos_university_study_plans (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null unique,
  agent_id text not null default 'cos',
  subject_id text not null check (subject_id in (
    'computer_science','mathematics','statistics_data_science','physics_natural_sciences','cybersecurity',
    'politics_government_international_relations','social_behavioral_sciences','economics_finance',
    'business_operations','law_regulation_governance','language_communication',
    'history_culture_philosophy_religion','reasoning_decision_science'
  )),
  language_code text check (language_code is null or language_code in ('en','es','pt','pl','ru')),
  language_dimension text check (language_dimension is null or language_dimension in (
    'comprehension','writing','instruction_following','translation_localization','cultural_pragmatics'
  )),
  failure_class text not null check (failure_class in (
    'retrieval','evidence_selection','grounding','stale_or_missing_knowledge','reasoning','calibration',
    'tool_execution','language','cross_domain','retention','unknown'
  )),
  target_grade text not null default 'A+' check (target_grade in ('A','A+')),
  source_kind text not null check (source_kind in (
    'failure_autopsy','operational_weakness','academic_rotation','language_rotation','recertification'
  )),
  source_ref text,
  problem_class text,
  objective text not null,
  methods jsonb not null default '[]'::jsonb check (jsonb_typeof(methods) = 'array'),
  acquisition_source_kinds jsonb not null default '[]'::jsonb check (jsonb_typeof(acquisition_source_kinds) = 'array'),
  fine_tune_candidate boolean not null default false,
  priority integer not null default 50 check (priority between 1 and 100),
  status text not null default 'queued' check (status in (
    'queued','studying','ready_for_exam','completed','superseded'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  evidence jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  last_attempt_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((language_code is null and language_dimension is null) or language_code is not null)
);

create index if not exists cos_university_study_plans_queue_idx
  on public.cos_university_study_plans(agent_id, status, priority desc, updated_at asc);
create index if not exists cos_university_study_plans_subject_idx
  on public.cos_university_study_plans(agent_id, subject_id, status, updated_at desc);
create index if not exists cos_university_study_plans_language_idx
  on public.cos_university_study_plans(agent_id, language_code, status, updated_at desc)
  where language_code is not null;

comment on table public.cos_university_study_plans is
  'Durable remediation/continuing-education queue. Plans may be created from operational weakness, but plans never promote academic grades.';
comment on column public.cos_university_study_plans.fine_tune_candidate is
  'Candidate flag only. The University planner never launches fine-tuning automatically.';

alter table public.cos_university_assessments enable row level security;
alter table public.cos_university_study_plans enable row level security;

revoke all on public.cos_university_assessments from anon, authenticated;
revoke all on public.cos_university_study_plans from anon, authenticated;
grant select, insert, update, delete on public.cos_university_assessments to service_role;
grant select, insert, update, delete on public.cos_university_study_plans to service_role;
