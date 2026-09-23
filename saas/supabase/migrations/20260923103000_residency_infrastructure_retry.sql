-- Permit repeated Residency infrastructure attempts for the same practical case.
-- Competency evidence remains unique and is only written after pedagogical acceptance.
alter table public.cos_university_residency_case_runs
  drop constraint if exists cos_university_residency_case_runs_residency_id_competency_id_variant_hash_key;
