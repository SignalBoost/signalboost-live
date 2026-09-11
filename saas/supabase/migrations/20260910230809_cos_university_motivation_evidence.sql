-- Admit the two host-evidence classes used by the motivation runtime.
alter table public.cos_university_learning_assurance_events
  drop constraint if exists cos_university_learning_assurance_events_event_type_check;

alter table public.cos_university_learning_assurance_events
  add constraint cos_university_learning_assurance_events_event_type_check
  check (event_type in (
    'fine_tune',
    'production_path',
    'learning_outcome',
    'team_contribution',
    'integrity_violation'
  ));
