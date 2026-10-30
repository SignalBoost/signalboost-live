-- Populate the existing builder_jobs.task_contract for COS customer tasks; no parallel task store.
-- Retain the unmodified parent objective, owner, execution ID and authority on every write.
CREATE OR REPLACE FUNCTION public.enforce_cos_canonical_task_contract()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE canonical jsonb;
BEGIN
  IF NEW.job_kind <> 'cos_turn' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.plan_version <> 1 OR coalesce(NEW.task_contract, '{}'::jsonb) <> '{}'::jsonb THEN
      RAISE EXCEPTION 'cos_task_contract_must_be_server_initialized' USING ERRCODE='23514';
    END IF;
    NEW.task_contract := jsonb_build_object(
      'immutable_objective', NEW.objective,
      'customer_identity', jsonb_build_object('user_id', NEW.user_id::text),
      'execution_id', NEW.id::text,
      'current_plan_version', NEW.plan_version,
      'authorized_capabilities', '[]'::jsonb,
      'budget', jsonb_build_object('approved_units', 0),
      'completed_actions_ledger', '[]'::jsonb,
      'evidence_store', '{}'::jsonb,
      'final_verification_result', NULL
    );
  ELSE
    canonical := OLD.task_contract;
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
      OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.job_kind IS DISTINCT FROM OLD.job_kind
      OR NEW.objective IS DISTINCT FROM OLD.objective
      OR NEW.plan_version IS DISTINCT FROM OLD.plan_version
      OR NEW.task_contract IS DISTINCT FROM canonical THEN
      RAISE EXCEPTION 'cos_task_contract_unauthorized_mutation' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Bring preexisting COS tasks onto the same schema without changing their objective or authority.
UPDATE public.builder_jobs
SET task_contract = jsonb_build_object(
  'immutable_objective', objective,
  'customer_identity', jsonb_build_object('user_id', user_id::text),
  'execution_id', id::text,
  'current_plan_version', plan_version,
  'authorized_capabilities', '[]'::jsonb,
  'budget', jsonb_build_object('approved_units', 0),
  'completed_actions_ledger', '[]'::jsonb,
  'evidence_store', '{}'::jsonb,
  'final_verification_result', NULL
)
WHERE job_kind = 'cos_turn' AND task_contract = '{}'::jsonb;

DROP TRIGGER IF EXISTS enforce_cos_canonical_task_contract ON public.builder_jobs;
CREATE TRIGGER enforce_cos_canonical_task_contract
BEFORE INSERT OR UPDATE ON public.builder_jobs
FOR EACH ROW EXECUTE FUNCTION public.enforce_cos_canonical_task_contract();
REVOKE ALL ON FUNCTION public.enforce_cos_canonical_task_contract() FROM PUBLIC, anon, authenticated;
