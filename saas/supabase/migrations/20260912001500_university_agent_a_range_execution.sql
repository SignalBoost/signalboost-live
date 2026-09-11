-- saas/supabase/migrations/20260912001500_university_agent_a_range_execution.sql
-- Host-owned per-execution identity for A-range runs (subject and language share this table),
-- mirroring the capstone and exam bindings. Legacy grades, credentials, RLS, grants and every
-- academic gate are unchanged.
ALTER TABLE public.cos_university_a_range_runs
  ADD COLUMN IF NOT EXISTS execution_provenance jsonb;

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

-- Historical rows are never rewritten: unbound specialist history stays unbound and the runtime
-- rejects it. The NOT VALID constraint still checks every future insert and update.
