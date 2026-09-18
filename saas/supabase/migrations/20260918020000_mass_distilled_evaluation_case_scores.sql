-- saas/supabase/migrations/20260918020000_mass_distilled_evaluation_case_scores.sql
-- Per-case judge scores for distilled-artifact evaluations.
--
-- Until now the evaluator computed a per-case score for every suite and then discarded it, persisting
-- only the four suite averages and a sha256 of the judge's raw response. The hash proves the response
-- existed but cannot be read back, so two questions that decide the distillation recipe were
-- unanswerable from the database: which cases a collapsing artifact actually failed, and whether a
-- suite that reports 1.0 is measuring anything. Production 2026-09-18: ten consecutive runs reported
-- safety, transfer and retention at exactly 1.0 for both baseline and candidate, including an artifact
-- scoring 0.34 on holdout -- three of the four graduation gates have never been exercised against a
-- discriminating value, and there was no way to see that from the run table alone.
--
-- This table records what the judge returned, nothing derived. It is evidence, not telemetry: one row
-- per (run, suite, case). Prompts, references and model answers are NOT stored here -- only the case
-- identifier the judge scored, so this adds no new copy of dataset content.

create table if not exists public.cos_university_distilled_evaluation_cases (
  run_key text not null,
  suite text not null,
  case_id text not null,
  baseline_score numeric(5,4) not null,
  candidate_score numeric(5,4) not null,
  candidate_safe boolean not null,
  candidate_id text not null,
  trained_artifact_hash text not null,
  evaluator_id text not null,
  evaluator_version text not null,
  observed_at timestamptz not null default now(),
  constraint cos_university_distilled_evaluation_cases_pkey primary key (run_key, suite, case_id),
  constraint cos_university_distilled_evaluation_cases_suite_check
    check (suite in ('holdout', 'safety', 'transfer', 'retention')),
  constraint cos_university_distilled_evaluation_cases_baseline_range
    check (baseline_score >= 0 and baseline_score <= 1),
  constraint cos_university_distilled_evaluation_cases_candidate_range
    check (candidate_score >= 0 and candidate_score <= 1)
);

comment on table public.cos_university_distilled_evaluation_cases is
  'Per-case judge scores behind each row of cos_university_distilled_evaluation_runs. Written by the mass and single-artifact distilled evaluators. Read-only evidence: never an input to promotion.';

-- Answering "which cases did this artifact fail" and "does this suite discriminate" are the two
-- access patterns; both filter by run or by artifact and scan a handful of rows.
create index if not exists cos_university_distilled_evaluation_cases_artifact_idx
  on public.cos_university_distilled_evaluation_cases (trained_artifact_hash, suite);

create index if not exists cos_university_distilled_evaluation_cases_observed_idx
  on public.cos_university_distilled_evaluation_cases (observed_at desc);

alter table public.cos_university_distilled_evaluation_cases enable row level security;

-- Service role only, matching cos_university_distilled_evaluation_runs. No anon or authenticated policy
-- is created: this is internal academic evidence and must not be reachable from the browser.
drop policy if exists cos_university_distilled_evaluation_cases_service
  on public.cos_university_distilled_evaluation_cases;
create policy cos_university_distilled_evaluation_cases_service
  on public.cos_university_distilled_evaluation_cases
  for all
  to service_role
  using (true)
  with check (true);
