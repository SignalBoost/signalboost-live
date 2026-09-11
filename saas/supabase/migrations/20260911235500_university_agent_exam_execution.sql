-- saas/supabase/migrations/20260911235500_university_agent_exam_execution.sql
-- Host-owned per-execution identity for independent exams, mirroring the capstone binding.
-- Legacy grades, credentials, RLS, grants and every academic gate are unchanged.
-- The original exam ledger has no agent_id. Derive it from the host-owned run key,
-- rather than defaulting every historical row to COS or trusting an independent label.
-- Only the recognized pre-multi-agent daily key format belongs to legacy COS.
ALTER TABLE public.cos_university_exam_runs
  ADD COLUMN IF NOT EXISTS agent_id text GENERATED ALWAYS AS (
    CASE
      WHEN split_part(run_key, ':', 1) = profile
        AND split_part(run_key, ':', 2) ~ '^[a-z][a-z0-9_-]*$'
        AND split_part(run_key, ':', 3) <> ''
        THEN split_part(run_key, ':', 2)
      WHEN profile = 'cos_university_unseen_v1'
        AND run_key ~ '^cos_university_unseen_v1:[0-9]{4}-[0-9]{2}-[0-9]{2}:(subject:[a-z_]+|language:(en|es|pt|pl|ru):[a-z_]+)$'
        THEN 'cos'
      ELSE NULL
    END
  ) STORED;

ALTER TABLE public.cos_university_exam_runs
  ADD CONSTRAINT cos_university_exam_run_identity_v1 CHECK (agent_id IS NOT NULL) NOT VALID;

ALTER TABLE public.cos_university_exam_runs
  ADD COLUMN IF NOT EXISTS execution_provenance jsonb;

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

-- Historical academic evidence is never rewritten. Generated ownership is metadata, not proof;
-- unbound specialist history stays unbound. NOT VALID still checks future inserts and updates.
