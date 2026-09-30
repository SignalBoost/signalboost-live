-- saas/supabase/migrations/20260930063000_residency_withdrawn_standing.sql
--
-- Builder Residency `withdrawn` standing (owner review 2026-09-30).
--
-- Residency practises on the exact artifact of a student that is still waiting for its final exam
-- (cos_local_distillation_artifacts.status = 'evaluation_pending'). Production 2026-09-30: all 10 active
-- residents' artifacts were already `retired` - the backlog compactor retires a waiting student once a newer
-- student of the identical training lineage has passed its exam - but their enrollments stayed active. Every
-- case then stopped on residency_exact_artifact_registry_mismatch (24 case turns in one hour, 0 passes) and the
-- 10 dead enrollments held every Residency seat, so no new Computer Science student could be admitted.
--
-- `withdrawn` is terminal and is NOT a verdict: not a pass, not a Residency FAIL. This migration only allows the
-- standing. The Residency cron closes such enrollments on its next tick, each with a durable record of why
-- (builder_residency_withdrawn), so the closure is audited. Safe to run more than once.

alter table public.cos_university_residency_enrollments
  drop constraint if exists cos_university_residency_enrollments_standing_check;

alter table public.cos_university_residency_enrollments
  add constraint cos_university_residency_enrollments_standing_check
  check (standing in ('resident','senior_resident','residency_complete','remediation_required','residency_failed','withdrawn'));