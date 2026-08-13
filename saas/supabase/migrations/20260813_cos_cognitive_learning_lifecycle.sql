-- COS cognitive learning: experience is not mastery.
--
-- This schema deliberately separates episodic experiences from durable skills. A teacher answer,
-- document, user correction, or production outcome may become an experience immediately; none of
-- them is automatically a learned skill. Skill promotion requires separate practice/validation
-- evidence and is governed in application code.

create table if not exists public.cos_cognitive_experiences (
  id uuid primary key default gen_random_uuid(),
  experience_hash text not null unique,
  subject text not null,
  experience_kind text not null check (experience_kind in (
    'encounter',
    'teacher',
    'feedback',
    'reflection',
    'practice',
    'holdout',
    'production_use'
  )),
  prompt_hash text,
  skill_key text,
  variant_key text,
  source_kind text,
  source_ref text,
  success boolean,
  score double precision check (score is null or (score >= 0 and score <= 1)),
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  evidence jsonb not null default '{}'::jsonb,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_cognitive_experiences_subject_time_idx
  on public.cos_cognitive_experiences(subject, last_observed_at desc);
create index if not exists cos_cognitive_experiences_skill_time_idx
  on public.cos_cognitive_experiences(skill_key, last_observed_at desc)
  where skill_key is not null;
create index if not exists cos_cognitive_experiences_kind_time_idx
  on public.cos_cognitive_experiences(experience_kind, last_observed_at desc);

create table if not exists public.cos_cognitive_skills (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null unique,
  subject text not null,
  title text not null,
  description text,
  procedure jsonb not null default '{}'::jsonb,
  status text not null default 'encountered' check (status in (
    'encountered',
    'evaluated',
    'understood',
    'practiced',
    'validated',
    'learned',
    'mastered',
    'weakened',
    'quarantined'
  )),
  evaluator_approved boolean not null default false,
  understanding_approved boolean not null default false,
  encounter_count integer not null default 0 check (encounter_count >= 0),
  practice_attempts integer not null default 0 check (practice_attempts >= 0),
  practice_successes integer not null default 0 check (practice_successes >= 0 and practice_successes <= practice_attempts),
  holdout_attempts integer not null default 0 check (holdout_attempts >= 0),
  holdout_successes integer not null default 0 check (holdout_successes >= 0 and holdout_successes <= holdout_attempts),
  distinct_holdout_variants integer not null default 0 check (distinct_holdout_variants >= 0),
  production_attempts integer not null default 0 check (production_attempts >= 0),
  production_successes integer not null default 0 check (production_successes >= 0 and production_successes <= production_attempts),
  reuse_count integer not null default 0 check (reuse_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  last_practiced_at timestamptz,
  last_validated_at timestamptz,
  last_used_at timestamptz,
  weakened_at timestamptz,
  quarantined_at timestamptz,
  quarantine_reason text,
  provenance jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_cognitive_skills_status_updated_idx
  on public.cos_cognitive_skills(status, updated_at desc);
create index if not exists cos_cognitive_skills_subject_updated_idx
  on public.cos_cognitive_skills(subject, updated_at desc);

alter table public.cos_cognitive_experiences enable row level security;
alter table public.cos_cognitive_skills enable row level security;

comment on table public.cos_cognitive_experiences is
  'Episodic COS memory: encounters, teacher interactions, feedback, reflections, practice, holdout tests and production outcomes. Experience does not imply learned knowledge.';
comment on table public.cos_cognitive_skills is
  'Procedural COS memory with explicit encountered→evaluated→understood→practiced→validated→learned→mastered lifecycle plus weakened/quarantined states. Lifecycle status must never directly inflate answer confidence.';
