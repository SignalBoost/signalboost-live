-- Evidence-arrival benchmark promotions are a distinct audit stream from learning-gap requeues.
create table if not exists public.cos_evidence_retest_events (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.cos_capability_benchmark_candidates(id) on delete cascade,
  benchmark_case_id uuid not null references public.cos_capability_benchmark_cases(id) on delete cascade,
  track text not null,
  content_hash text,
  source_kind text,
  matched_terms jsonb not null default '[]'::jsonb,
  coverage double precision not null check (coverage >= 0 and coverage <= 1),
  rationale text not null,
  created_at timestamptz not null default now(),
  unique (candidate_id)
);
create index if not exists cos_evidence_retest_events_created_idx on public.cos_evidence_retest_events(created_at desc);
alter table public.cos_evidence_retest_events enable row level security;
revoke all on table public.cos_evidence_retest_events from anon, authenticated;
comment on table public.cos_evidence_retest_events is 'Bounded audit metadata for deterministic evidence-triggered benchmark retests; no answer, prompt, source URI, or hidden reasoning is stored.';
