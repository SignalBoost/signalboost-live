-- Phase 1 foundation: evolve the existing Builder job into a canonical customer task.
-- No new store, no automatic COS execution, and no authority expansion.
ALTER TABLE public.builder_jobs
  ADD COLUMN IF NOT EXISTS plan_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS task_contract jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.builder_jobs
  ADD CONSTRAINT builder_jobs_plan_version_positive CHECK (plan_version >= 1),
  ADD CONSTRAINT builder_jobs_task_contract_object CHECK (jsonb_typeof(task_contract) = 'object');

ALTER TABLE public.builder_jobs DROP CONSTRAINT builder_jobs_kind_check;
ALTER TABLE public.builder_jobs
  ADD CONSTRAINT builder_jobs_kind_check CHECK (job_kind IN ('standard', 'debug_file', 'cos_turn'));

CREATE OR REPLACE FUNCTION public.protect_builder_task_objective()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.objective IS DISTINCT FROM OLD.objective THEN
    RAISE EXCEPTION 'customer_task_objective_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS protect_builder_task_objective ON public.builder_jobs;
CREATE TRIGGER protect_builder_task_objective BEFORE UPDATE ON public.builder_jobs
  FOR EACH ROW EXECUTE FUNCTION public.protect_builder_task_objective();

-- The existing claim_builder_job_slice accepts any queued job_kind while claim_generation < 4.
-- Protect COS-only tasks even if a caller mistakenly invokes that RPC.
CREATE OR REPLACE FUNCTION public.prevent_cos_task_builder_claim()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $cos_claim_guard$
BEGIN
  IF OLD.job_kind = 'cos_turn'
    AND (NEW.claim_generation IS DISTINCT FROM OLD.claim_generation
      OR (NEW.status = 'running' AND OLD.status <> 'running')) THEN
    RAISE EXCEPTION 'cos_task_not_builder_executable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$cos_claim_guard$;
DROP TRIGGER IF EXISTS prevent_cos_task_builder_claim ON public.builder_jobs;
CREATE TRIGGER prevent_cos_task_builder_claim BEFORE UPDATE ON public.builder_jobs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_cos_task_builder_claim();

