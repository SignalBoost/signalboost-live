-- One independent failure verdict per provider job, enforced atomically by Postgres.
-- The existing append-only trigger forbids UPDATE/DELETE; competing signed claims must not
-- silently replace a prior decision or create multiple classifications for one job.
create unique index if not exists cos_university_lab_failure_verdict_one_per_job_idx
  on public.cos_university_learning_assurance_events ((evidence->>'jobId'))
  where event_type = 'lab_failure_verdict';
