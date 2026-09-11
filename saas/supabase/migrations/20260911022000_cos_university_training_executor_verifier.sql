alter table public.cos_university_learning_assurance_events
  drop constraint if exists cos_university_learning_assurance_events_verifier_check;

alter table public.cos_university_learning_assurance_events
  add constraint cos_university_learning_assurance_events_verifier_check
  check (verifier in ('host_controller','host_production_verifier','independent_scorer','training_executor'));
