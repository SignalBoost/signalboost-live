-- saas/supabase/migrations/20260913041500_cos_university_lane_fault_events.sql
-- A lane that stops executing currently leaves no trace anywhere. On 2026-09-13 the independent
-- exam lane was switched off and produced no receipts for hours; the verification board reported it
-- identically to `graduation`, which is gated on purpose until minimum residence elapses. Nothing
-- observed the difference, and three downstream lanes waited on unseen passes that could no longer
-- be produced.
--
-- `lane_fault` records that a lane which the enrollment calendar expects to be running is not.
-- It is an observation of absence, never academic evidence: it can not award, advance or revoke any
-- grade, and the verification reader ignores it when deciding whether a path is verified.
alter table public.cos_university_learning_assurance_events
  drop constraint if exists cos_university_learning_assurance_events_event_type_check;

alter table public.cos_university_learning_assurance_events
  add constraint cos_university_learning_assurance_events_event_type_check
  check (event_type in (
    'fine_tune',
    'production_path',
    'learning_outcome',
    'team_contribution',
    'integrity_violation',
    'lane_fault'
  ));
