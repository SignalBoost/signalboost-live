-- saas/supabase/migrations/20260819_cos_benchmark_case_candidates.sql
--
-- A REVIEW QUEUE BETWEEN REAL FAILURES AND THE HELD-OUT BENCHMARK — deliberately not a direct pipe.
--
-- Auto-promoting a failed interaction straight into cos_capability_benchmark_cases would destroy the
-- one property that makes that table worth anything. COS already studies its own failures: every
-- low-confidence or escalated turn lands in cos_learning_gaps and becomes a study subject. If the
-- same interaction also becomes a benchmark case, COS is studying the test. The pass rate rises and
-- measured capability does not. This repo already encodes that rule one layer down — see the
-- cos_active_practice_queue constraint forbidding holdout + local_generator, i.e. holdouts must come
-- from an independent, curated or replay source. This table applies the same rule to benchmark cases.
--
-- Candidates are captured automatically. Cases are created by a PERSON, who supplies the pass
-- criteria. Nothing here invents what a correct answer must contain.

create table if not exists public.cos_benchmark_case_candidates (
  id uuid primary key default gen_random_uuid(),
  -- Sha256 of the normalized prompt. Makes repeated harvests idempotent.
  source_hash text not null unique,
  -- Where the failure was observed. 'learning_gap' harvests the durable gap queue, which already
  -- records exactly the interactions that failed, so no new instrumentation touches the chat path.
  origin text not null default 'learning_gap' check (origin in ('learning_gap', 'manual')),
  source_ref text,
  track text not null,
  prompt text not null,
  observed_confidence double precision,
  escalation_reason text,
  repeated_count integer not null default 1 check (repeated_count >= 1),
  -- TRUE when COS has already studied this material. A contaminated candidate can still be useful as
  -- practice, but it can never become a held-out case: the answer may be memorized rather than reasoned.
  contaminated boolean not null default false,
  contamination_reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_note text,
  -- Set when approval creates a benchmark case, so a case can always be traced back to its evidence.
  promoted_case_id uuid references public.cos_capability_benchmark_cases(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cos_benchmark_case_candidates_status_idx
  on public.cos_benchmark_case_candidates(status, created_at desc);

-- Provenance on the benchmark cases themselves. Without this, a case created six months ago cannot
-- be distinguished from an auto-captured one, and the held-out claim becomes unverifiable.
alter table public.cos_capability_benchmark_cases
  add column if not exists origin text not null default 'curated';
alter table public.cos_capability_benchmark_cases
  add column if not exists source_candidate_id uuid references public.cos_benchmark_case_candidates(id) on delete set null;
alter table public.cos_capability_benchmark_cases
  add column if not exists approved_by text;
alter table public.cos_capability_benchmark_cases
  add column if not exists approved_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cos_capability_benchmark_cases_origin_check'
  ) then
    alter table public.cos_capability_benchmark_cases
      add constraint cos_capability_benchmark_cases_origin_check
      check (origin in ('curated', 'replay', 'independent', 'reviewed_capture'));
  end if;
end $$;

-- A case derived from captured production material must carry a named approver. This is the
-- structural version of "a permission without a recorded who and when is an assertion".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cos_capability_benchmark_cases_capture_review_check'
  ) then
    alter table public.cos_capability_benchmark_cases
      add constraint cos_capability_benchmark_cases_capture_review_check
      check (origin <> 'reviewed_capture' or (approved_by is not null and source_candidate_id is not null));
  end if;
end $$;

comment on table public.cos_benchmark_case_candidates is
  'Review queue for turning observed COS failures into held-out benchmark cases. Capture is automatic; promotion requires a person who supplies the pass criteria. Contaminated candidates (material COS has already studied) must never be promoted.';

alter table public.cos_benchmark_case_candidates enable row level security;
revoke all on public.cos_benchmark_case_candidates from anon, authenticated;
