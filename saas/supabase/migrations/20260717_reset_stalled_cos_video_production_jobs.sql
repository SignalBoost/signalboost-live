-- Reset stalled COS video production jobs so the queue watchdog can retry them.
-- Keep the statement as plain PostgreSQL DML: UPDATE ... SET ... WHERE ...;

UPDATE public.cos_video_production_jobs
SET
  status = 'queued',
  attempt_count = 0,
  lifecycle_state = 'warning',
  updated_at = now()
WHERE status IN ('rendering', 'failed', 'stalled')
  AND lifecycle_state IN ('warning', 'rerouted', 'escalated', 'dlq');
