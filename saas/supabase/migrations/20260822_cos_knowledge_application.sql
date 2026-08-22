-- Newly retained evidence may requeue (never resolve) a dormant COS study question.
alter table public.cos_learning_gaps
  add column if not exists reopened_count integer not null default 0 check (reopened_count >= 0);
alter table public.cos_learning_gaps add column if not exists last_reopened_at timestamptz;
alter table public.cos_learning_gaps add column if not exists reopen_reason text;

comment on column public.cos_learning_gaps.reopened_count is
  'Bounded number of evidence-driven requeues. Repeated reopens without resolution indicate a matcher problem.';
comment on column public.cos_learning_gaps.reopen_reason is
  'Bounded audit rationale for an evidence-driven requeue; a requeue is never an answer or resolution.';

create table if not exists public.cos_knowledge_application_events (
  id uuid primary key default gen_random_uuid(),
  gap_id uuid not null,
  gap_subject text not null,
  content_hash text,
  source_kind text,
  matched_terms jsonb not null default '[]'::jsonb,
  coverage double precision not null default 0 check (coverage >= 0 and coverage <= 1),
  verdict text not null,
  rationale text,
  created_at timestamptz not null default now()
);
create index if not exists cos_knowledge_application_events_created_idx on public.cos_knowledge_application_events(created_at desc);
create index if not exists cos_knowledge_application_events_gap_idx on public.cos_knowledge_application_events(gap_id, created_at desc);
alter table public.cos_knowledge_application_events enable row level security;
revoke all on public.cos_knowledge_application_events from anon, authenticated;
comment on table public.cos_knowledge_application_events is
  'Bounded audit metadata explaining why new evidence requeued a dormant COS question; no prompt, answer, summary or source URI is stored.';
