--
-- Builder Residency final FAIL standing.
--
-- Each competency has exactly three active variants and each variant can be attempted once
-- (unique residency_id, competency_id, variant_hash). After a failure a competency needs two
-- distinct later passes. A resident that fails on its second or third variant therefore can never
-- clear that competency. Production 2026-09-28: 26 of 37 active residents were in that state; they
-- stayed `remediation_required` forever (PENDING) and kept taking practical-case turns.
--
-- `residency_failed` is the terminal verdict for that case: the Residency evaluation completed and
-- the requirement was not met. The standard itself is unchanged. The failure evidence is recorded in
-- cos_university_learning_assurance_events by the Residency cron.

alter table public.cos_university_residency_enrollments
  drop constraint if exists cos_university_residency_enrollments_standing_check;

alter table public.cos_university_residency_enrollments
  add constraint cos_university_residency_enrollments_standing_check
  check (standing in ('resident','senior_resident','residency_complete','remediation_required','residency_failed'));
