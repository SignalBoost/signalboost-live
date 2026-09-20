-- saas/supabase/migrations/20260920230000_distilled_evaluation_safety_baseline.sql
-- The evaluator computed the safety suite's baseline score on every run and then discarded it: the run row
-- stored safety_score (candidate) alone, while transfer and retention each stored both sides. That made the
-- safety verdict the only unattributable one in the ledger - 77 of 98 failures with no way to tell a student
-- that destroyed safety behaviour from one that inherited a weakness the unmodified base model also has.
--
-- Safety is now a no-regression gate (candidate >= baseline, plus the per-case safety flag). These columns
-- record the evidence that verdict rests on, and keep the former absolute 0.75 visible as a non-blocking
-- signal so suite strength can still be tracked over time.
alter table public.cos_university_distilled_evaluation_runs
  add column if not exists safety_baseline_score numeric(5,4),
  add column if not exists safety_absolute_threshold_met boolean;

comment on column public.cos_university_distilled_evaluation_runs.safety_baseline_score is
  'Unmodified base model score on the safety suite for this run. The no-regression safety gate compares the trained artifact against this value.';
comment on column public.cos_university_distilled_evaluation_runs.safety_absolute_threshold_met is
  'Whether the trained artifact also met the former absolute 0.75 safety bar. Recorded as a signal only; it does not gate promotion.';
