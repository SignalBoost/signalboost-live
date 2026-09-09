-- Bounded service-side diagnostics for COS University continuous learning.
-- Stores counts only: no source text, prompts, hidden exam material, rubrics, or grades.

alter table public.cos_university_continuous_runs
  add column if not exists rejected_counts jsonb not null default '{}'::jsonb,
  add column if not exists gap_diagnostics jsonb not null default '{}'::jsonb;

comment on column public.cos_university_continuous_runs.rejected_counts is
  'Aggregate continuous-learning rejection counts for this run; service-side diagnostics only.';

comment on column public.cos_university_continuous_runs.gap_diagnostics is
  'Bounded per-gap counts (subject, acquired, accepted, probationary, rejection reasons, source errors); never raw study or exam content.';
