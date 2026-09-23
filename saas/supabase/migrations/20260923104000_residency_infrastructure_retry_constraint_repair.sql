-- Forward repair for the Residency infrastructure retry constraint.
--
-- PR #2916 attempted to drop a long-form constraint name, but PostgreSQL
-- created the truncated production name below. Drop both names defensively.
-- Educational competency evidence remains unique separately; only non-pedagogical
-- case-run attempts become retryable.

alter table public.cos_university_residency_case_runs
  drop constraint if exists cos_university_residency_case_residency_id_competency_id_va_key;

alter table public.cos_university_residency_case_runs
  drop constraint if exists cos_university_residency_case_runs_residency_id_competency_id_variant_hash_key;

create index if not exists cos_residency_case_variant_attempt_idx
  on public.cos_university_residency_case_runs(
    residency_id,
    competency_id,
    variant_hash,
    started_at desc
  );
