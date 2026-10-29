-- Read-only preflight for 20261029130000_builder_stale_expiry_heartbeat_fence.sql.
-- Run against the selected staging/production database; requires no table mutation.
-- Fail release if prerequisites absent, or if the installed function still lacks the guards.
WITH prerequisites AS (
 SELECT
   to_regclass('public.builder_jobs') IS NOT NULL AS builder_jobs_exists,
   count(*) FILTER (WHERE column_name='checkpoint')=1 AS checkpoint_exists,
   count(*) FILTER (WHERE column_name='last_heartbeat_at')=1 AS heartbeat_exists,
   count(*) FILTER (WHERE column_name='updated_at')=1 AS updated_exists,
   count(*) FILTER (WHERE column_name='claim_generation')=1 AS generation_exists
 FROM information_schema.columns
 WHERE table_schema='public' AND table_name='builder_jobs'
), installed AS (
 SELECT pg_get_functiondef(to_regprocedure('public.expire_stale_builder_jobs(uuid,timestamptz,uuid,uuid)')) AS body
)
SELECT
  prerequisites.*,
  body IS NOT NULL AS expiry_function_exists,
  coalesce(body LIKE '%checkpoint is null%',false) AS checkpoint_guard_installed,
  coalesce(body LIKE '%greatest(updated_at, coalesce(last_heartbeat_at, updated_at)) <= p_cutoff%',false) AS heartbeat_guard_installed
FROM prerequisites CROSS JOIN installed;
-- Deployment gate: all prerequisite flags must be true.
-- BEFORE migration both *_guard_installed may be false; AFTER migration both must be true.
-- Verify precisely two occurrences of each guard in the installed function:
-- selection and conditional UPDATE. Do not count source files as applied migrations.
