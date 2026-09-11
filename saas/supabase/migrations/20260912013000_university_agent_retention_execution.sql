-- saas/supabase/migrations/20260912013000_university_agent_retention_execution.sql
-- Host-owned per-execution identity for delayed-retention runs, mirroring the capstone, exam and
-- A-range bindings. Legacy grades, credentials, RLS, grants and every academic gate are unchanged.
ALTER TABLE public.cos_university_retention_runs
  ADD COLUMN IF NOT EXISTS execution_provenance jsonb;

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

-- Historical rows are never rewritten: unbound specialist history stays unbound and the runtime
-- rejects it. The NOT VALID constraint still checks every future insert and update.
