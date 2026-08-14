-- COS Council: bounded, auditable specialist deliberation.
--
-- Council artifacts are advisory reasoning records. They are not factual evidence and must never be
-- treated as a substitute for deterministic/tool verification or calibrated answer confidence.

create table if not exists public.cos_council_sessions (
  id uuid primary key default gen_random_uuid(),
  prompt_hash text not null,
  problem_class text not null,
  trigger_reasons jsonb not null default '[]'::jsonb,
  metacognitive_region text not null default 'unknown'
    check (metacognitive_region in ('strong','developing','weak','untested','conflicted','unknown')),
  repeated_gap_count integer not null default 0 check (repeated_gap_count >= 0),
  high_consequence boolean not null default false,
  evidence_sparse boolean not null default false,
  selected_roles text[] not null default '{}'::text[],
  deterministic_findings jsonb not null default '[]'::jsonb,
  status text not null default 'started'
    check (status in ('started','deliberated','failed','verified')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  verified_at timestamptz
);

create index if not exists cos_council_sessions_problem_class_idx
  on public.cos_council_sessions(problem_class, created_at desc);
create index if not exists cos_council_sessions_status_idx
  on public.cos_council_sessions(status, created_at desc);

create table if not exists public.cos_council_opinions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.cos_council_sessions(id) on delete cascade,
  role text not null check (role in ('architect','sre','database','security','business','skeptic')),
  conclusion text not null,
  claims jsonb not null default '[]'::jsonb,
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  credibility_weight double precision not null default 1 check (credibility_weight >= 0.5 and credibility_weight <= 1.5),
  reasoner_label text,
  created_at timestamptz not null default now()
);

create index if not exists cos_council_opinions_session_idx
  on public.cos_council_opinions(session_id, created_at asc);
create index if not exists cos_council_opinions_role_idx
  on public.cos_council_opinions(role, created_at desc);

create table if not exists public.cos_council_member_credibility (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('architect','sre','database','security','business','skeptic')),
  problem_class text not null,
  verified_cases integer not null default 0 check (verified_cases >= 0),
  correct_cases integer not null default 0 check (correct_cases >= 0 and correct_cases <= verified_cases),
  last_verified_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role, problem_class)
);

create index if not exists cos_council_member_credibility_problem_idx
  on public.cos_council_member_credibility(problem_class, verified_cases desc);

alter table public.cos_council_sessions enable row level security;
alter table public.cos_council_opinions enable row level security;
alter table public.cos_council_member_credibility enable row level security;

comment on table public.cos_council_sessions is
  'Auditable COS Council sessions. Trigger state and specialist roles are metacognitive/advisory artifacts, not factual evidence.';
comment on table public.cos_council_opinions is
  'Independent first opinions stored as conclusions, claims, evidence labels, assumptions, observables and falsifiers. No hidden chain-of-thought is stored.';
comment on table public.cos_council_member_credibility is
  'Domain/problem-class specialist reliability learned only from externally verified outcomes. Empty rows imply neutral weight, not fabricated expertise.';
