-- Speed candidate-scoped COS University evaluator evidence reads.
-- Production 2026-09-20: the rolling evaluator timed out before authorization logging because
-- fine_tune evidence was indexed only by (event_type, observed_at). Candidate-scoped reads
-- therefore scanned the broad fine_tune window and filtered candidate_id afterward.
create index if not exists cos_university_learning_assurance_fine_tune_candidate_verifier_observed_idx
  on public.cos_university_learning_assurance_events (candidate_id, verifier, observed_at desc)
  where event_type = 'fine_tune';
