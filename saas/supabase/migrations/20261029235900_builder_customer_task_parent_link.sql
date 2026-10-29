-- Link delegated Builder executions to the existing COS customer task; no new task store.
CREATE INDEX IF NOT EXISTS builder_jobs_customer_task_lookup_idx
 ON public.builder_jobs ((metadata->>'customerTaskId'))
 WHERE metadata ? 'customerTaskId';

CREATE OR REPLACE FUNCTION public.enforce_builder_customer_task_parent()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_parent public.builder_jobs;
BEGIN
 IF NEW.metadata ? 'customerTaskId' THEN
   IF NEW.job_kind <> 'standard' OR
      coalesce(NEW.metadata->>'customerTaskId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   THEN RAISE EXCEPTION 'builder_customer_task_invalid_link' USING ERRCODE='23514'; END IF;
   SELECT * INTO v_parent FROM public.builder_jobs WHERE id=(NEW.metadata->>'customerTaskId')::uuid;
   IF NOT FOUND OR v_parent.job_kind <> 'cos_turn' OR v_parent.user_id <> NEW.user_id
      OR v_parent.conversation_id <> NEW.conversation_id
   THEN RAISE EXCEPTION 'builder_customer_task_ownership_mismatch' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS enforce_builder_customer_task_parent ON public.builder_jobs;
CREATE TRIGGER enforce_builder_customer_task_parent
 BEFORE INSERT OR UPDATE OF metadata,user_id,conversation_id,job_kind ON public.builder_jobs
 FOR EACH ROW EXECUTE FUNCTION public.enforce_builder_customer_task_parent();
REVOKE ALL ON FUNCTION public.enforce_builder_customer_task_parent() FROM PUBLIC, anon, authenticated;
