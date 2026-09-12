-- saas/supabase/migrations/20260912030000_university_agent_execution_binding_apply.sql
-- Re-runnable apply of four already-committed migrations that were never executed against the
-- production database (nothing in the repo applies migrations on deploy; merging a PR does not
-- touch the schema). Sources, unchanged in meaning:
--   20260911201757_university_agent_capstone_execution.sql
--   20260911235500_university_agent_exam_execution.sql
--   20260912001500_university_agent_a_range_execution.sql
--   20260912013000_university_agent_retention_execution.sql
-- Every statement is guarded, so running this twice is a no-op. No historical row is rewritten:
-- agent_id is derived from the host-owned run key, execution_provenance starts NULL everywhere,
-- and every constraint is NOT VALID so existing academic evidence is left exactly as recorded.
-- Run through Hub -> Run Migration (DDL; the SQL editor only accepts SELECT-shaped statements).

-- 1. Independent exams: host-owned per-execution identity derived from the run key.
ALTER TABLE public.cos_university_exam_runs
  ADD COLUMN IF NOT EXISTS agent_id text GENERATED ALWAYS AS (
    CASE
      WHEN profile = 'cos_university_unseen_v1'
        AND run_key ~ '^cos_university_unseen_v1:[0-9]{4}-[0-9]{2}-[0-9]{2}:(subject:[a-z_]+|language:(en|es|pt|pl|ru):[a-z_]+)$'
        THEN 'cos'
      WHEN split_part(run_key, ':', 1) = profile
        AND split_part(run_key, ':', 2) ~ '^[a-z0-9][a-z0-9_-]{0,179}$'
        AND (split_part(run_key, ':', 3) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          OR split_part(run_key, ':', 3) = 'remediation')
        THEN split_part(run_key, ':', 2)
      ELSE NULL
    END
  ) STORED;

ALTER TABLE public.cos_university_exam_runs
  ADD COLUMN IF NOT EXISTS execution_provenance jsonb;

DO $apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.cos_university_exam_runs')
      AND conname = 'cos_university_exam_run_identity_v1') THEN
    ALTER TABLE public.cos_university_exam_runs
      ADD CONSTRAINT cos_university_exam_run_identity_v1 CHECK (agent_id IS NOT NULL) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.cos_university_exam_runs')
      AND conname = 'cos_university_exam_execution_binding_v1') THEN
    ALTER TABLE public.cos_university_exam_runs
      ADD CONSTRAINT cos_university_exam_execution_binding_v1 CHECK (
        (execution_provenance IS NULL AND (agent_id = 'cos' OR fresh_execution IS NOT TRUE))
        OR (
          execution_provenance IS NOT NULL AND agent_id <> 'cos'
          AND (jsonb_typeof(execution_provenance) = 'object'
            AND execution_provenance->>'runtime' = 'university_software_specialist_v1'
            AND execution_provenance->>'role' = 'software_engineering'
            AND execution_provenance->>'agentId' = agent_id
            AND execution_provenance->>'runId' = id::text
            AND execution_provenance->>'turnId' = turn_id::text
            AND execution_provenance->>'manifestHash' = manifest_hash
            AND length(btrim(execution_provenance->>'model')) > 0
            AND execution_provenance->>'promptHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'responseHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'contextHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'academicAuthority' = 'none'
            AND response_source = 'university_software_specialist_v1'
            AND local_model_invoked IS TRUE AND external_ai_invoked IS FALSE
          ) IS TRUE
        )
      ) NOT VALID;
  END IF;
END
$apply$;

-- 2. A-range runs (subject and language share this table).
ALTER TABLE public.cos_university_a_range_runs
  ADD COLUMN IF NOT EXISTS execution_provenance jsonb;

DO $apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.cos_university_a_range_runs')
      AND conname = 'cos_university_a_range_execution_binding_v1') THEN
    ALTER TABLE public.cos_university_a_range_runs
      ADD CONSTRAINT cos_university_a_range_execution_binding_v1 CHECK (
        (execution_provenance IS NULL AND (agent_id = 'cos' OR fresh_execution IS NOT TRUE))
        OR (
          execution_provenance IS NOT NULL AND agent_id <> 'cos'
          AND (jsonb_typeof(execution_provenance) = 'object'
            AND execution_provenance->>'runtime' = 'university_software_specialist_v1'
            AND execution_provenance->>'role' = 'software_engineering'
            AND execution_provenance->>'agentId' = agent_id
            AND execution_provenance->>'runId' = id::text
            AND execution_provenance->>'turnId' = turn_id::text
            AND execution_provenance->>'manifestHash' = manifest_hash
            AND length(btrim(execution_provenance->>'model')) > 0
            AND execution_provenance->>'promptHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'responseHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'contextHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'academicAuthority' = 'none'
            AND response_source = 'university_software_specialist_v1'
            AND local_model_invoked IS TRUE AND external_ai_invoked IS FALSE
          ) IS TRUE
        )
      ) NOT VALID;
  END IF;
END
$apply$;

-- 3. Delayed-retention runs.
ALTER TABLE public.cos_university_retention_runs
  ADD COLUMN IF NOT EXISTS execution_provenance jsonb;

DO $apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.cos_university_retention_runs')
      AND conname = 'cos_university_retention_execution_binding_v1') THEN
    ALTER TABLE public.cos_university_retention_runs
      ADD CONSTRAINT cos_university_retention_execution_binding_v1 CHECK (
        (execution_provenance IS NULL AND (agent_id = 'cos' OR passed IS NULL))
        OR (
          execution_provenance IS NOT NULL AND agent_id <> 'cos'
          AND (jsonb_typeof(execution_provenance) = 'object'
            AND execution_provenance->>'runtime' = 'university_software_specialist_v1'
            AND execution_provenance->>'role' = 'software_engineering'
            AND execution_provenance->>'agentId' = agent_id
            AND execution_provenance->>'runId' = id::text
            AND execution_provenance->>'turnId' = turn_id::text
            AND execution_provenance->>'manifestHash' = source_manifest_hash
            AND length(btrim(execution_provenance->>'model')) > 0
            AND execution_provenance->>'promptHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'responseHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'contextHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'academicAuthority' = 'none'
          ) IS TRUE
        )
      ) NOT VALID;
  END IF;
END
$apply$;

-- 4. Generalist capstone runs. The graduation runner selects execution_provenance from this table,
-- so without this column every graduation read fails outright with an undefined-column error.
ALTER TABLE public.cos_university_generalist_capstone_runs
  ADD COLUMN IF NOT EXISTS execution_provenance jsonb;

DO $apply$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = to_regclass('public.cos_university_generalist_capstone_runs')
      AND conname = 'cos_university_capstone_execution_binding_v1') THEN
    ALTER TABLE public.cos_university_generalist_capstone_runs
      ADD CONSTRAINT cos_university_capstone_execution_binding_v1 CHECK (
        (execution_provenance IS NULL AND (agent_id = 'cos' OR fresh_execution IS NOT TRUE))
        OR (
          execution_provenance IS NOT NULL AND agent_id <> 'cos'
          AND (jsonb_typeof(execution_provenance) = 'object'
            AND execution_provenance->>'runtime' = 'university_software_specialist_v1'
            AND execution_provenance->>'role' = 'software_engineering'
            AND execution_provenance->>'agentId' = agent_id
            AND execution_provenance->>'runId' = id::text
            AND execution_provenance->>'turnId' = turn_id::text
            AND execution_provenance->>'manifestHash' = manifest_hash
            AND length(btrim(execution_provenance->>'model')) > 0
            AND execution_provenance->>'promptHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'responseHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'contextHash' ~ '^[a-f0-9]{64}$'
            AND execution_provenance->>'academicAuthority' = 'none'
            AND response_source = 'university_software_specialist_v1'
            AND local_model_invoked IS TRUE AND external_ai_invoked IS FALSE
          ) IS TRUE
        )
      ) NOT VALID;
  END IF;
END
$apply$;

COMMENT ON COLUMN public.cos_university_generalist_capstone_runs.execution_provenance IS
  'Host execution binding: learner, registered role, run, trace, selected model, input/output hashes. Not a self-score or degree.'
