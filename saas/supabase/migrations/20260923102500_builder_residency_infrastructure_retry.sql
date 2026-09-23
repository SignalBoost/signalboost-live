-- Residency infrastructure retries must not consume a pedagogical case variant.
--
-- The original unique constraint allowed only one case-run row per
-- (residency, competency, variant). An infrastructure rejection therefore made
-- the same unseen case impossible to retry even though no competency evidence
-- had been recorded. Competency evidence remains unique by
-- (residency, competency, variant), so only the durable educational verdict is
-- single-use; infrastructure attempts may be repeated and remain auditable.

alter table public.cos_university_residency_case_runs
  drop constraint if exists cos_university_residency_case_residency_id_competency_id_va_key;

create index if not exists cos_residency_case_variant_attempt_idx
  on public.cos_university_residency_case_runs(
    residency_id,
    competency_id,
    variant_hash,
    started_at desc
  );
