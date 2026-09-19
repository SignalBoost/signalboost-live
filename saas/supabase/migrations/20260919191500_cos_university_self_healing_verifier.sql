-- saas/supabase/migrations/20260919191500_cos_university_self_healing_verifier.sql
-- The recovery drill must distinguish an autonomous Self-Healing Supervisor repair from owner/manual
-- interference. The drill observer already treats verifier=self_healing_supervisor as the autonomous
-- actor, but the live assurance ledger verifier constraint predates that actor and rejects the value.
--
-- Preserve every existing verifier authority exactly and add only the bounded Supervisor identity.
-- This does not grant a learning grade, promotion, spending, provider, or Production-traffic authority;
-- it only lets the existing assurance ledger identify who performed the registered recovery.

alter table public.cos_university_learning_assurance_events
  drop constraint if exists cos_university_learning_assurance_events_verifier_check;

alter table public.cos_university_learning_assurance_events
  add constraint cos_university_learning_assurance_events_verifier_check
  check (verifier = any (array[
    'host_controller'::text,
    'host_production_verifier'::text,
    'independent_scorer'::text,
    'training_executor'::text,
    'self_healing_supervisor'::text
  ]));
