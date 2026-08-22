-- Autonomous cognitive certification for COS procedural skills.
--
-- Private curated certification cases are independent of the local model that creates/refines a
-- candidate. This migration creates the protected store only; held-out prompts are seeded directly
-- into production and are deliberately NOT committed to the public repository.

create table if not exists public.cos_cognitive_certification_cases (
  id uuid primary key default gen_random_uuid(),
  profile_key text not null,
  case_key text not null,
  case_kind text not null check (case_kind in ('understanding','practice','holdout')),
  prompt text not null,
  rubric jsonb not null default '{}'::jsonb,
  source_kind text not null default 'curated_private' check (source_kind in ('curated_private','operator_curated')),
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(profile_key, case_key)
);

create index if not exists cos_cognitive_certification_cases_profile_kind_idx
  on public.cos_cognitive_certification_cases(profile_key, case_kind, active, case_key);

create table if not exists public.cos_cognitive_certification_events (
  id uuid primary key default gen_random_uuid(),
  skill_key text not null references public.cos_cognitive_skills(skill_key) on delete cascade,
  profile_key text not null,
  phase text not null,
  success boolean,
  score double precision check (score is null or (score >= 0 and score <= 1)),
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cos_cognitive_certification_events_skill_time_idx
  on public.cos_cognitive_certification_events(skill_key, created_at desc);
create index if not exists cos_cognitive_certification_events_profile_time_idx
  on public.cos_cognitive_certification_events(profile_key, created_at desc);

alter table public.cos_cognitive_certification_cases enable row level security;
alter table public.cos_cognitive_certification_events enable row level security;

comment on table public.cos_cognitive_certification_cases is
  'Server-owned private certification cases. Prompts/rubrics are independent of the candidate-generating model and never public training examples.';
comment on table public.cos_cognitive_certification_events is
  'Auditable autonomous certification activity. Events are evidence records, never direct promotion authority.';

-- No public/authenticated policies are created. Service-role runtime access remains the only DML
-- path, matching the rest of the protected cognitive-learning evidence stores.
