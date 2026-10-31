-- Return whether this transaction actually admitted a new COS task.
-- Existing task IDs must only attach to their original History receipt; they
-- must never schedule a second worker or external side effect.
CREATE OR REPLACE FUNCTION public.admit_cos_customer_task_once(
  p_task_id uuid, p_user_id uuid, p_conversation_id uuid,
  p_objective text, p_running_reply text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path=public,pg_temp AS $admit_once$
DECLARE
  v_existing public.builder_jobs%ROWTYPE;
  v_history uuid;
BEGIN
  IF p_task_id IS NULL OR p_user_id IS NULL OR p_conversation_id IS NULL THEN
    RAISE EXCEPTION 'cos_task_invalid_admission' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_task_id::text, 0));
  SELECT * INTO v_existing FROM public.builder_jobs WHERE id=p_task_id;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id
      OR v_existing.conversation_id <> p_conversation_id
      OR v_existing.objective <> btrim(coalesce(p_objective,''))
      OR v_existing.job_kind <> 'cos_turn'
      OR v_existing.history_message_id IS NULL THEN
      RAISE EXCEPTION 'cos_task_identity_conflict' USING ERRCODE='23505';
    END IF;
    RETURN jsonb_build_object('historyMessageId',v_existing.history_message_id,'admittedNew',false);
  END IF;
  -- Reuse the existing transactional admission and its ownership checks.
  v_history := public.admit_cos_customer_task(
    p_task_id,p_user_id,p_conversation_id,p_objective,p_running_reply
  );
  RETURN jsonb_build_object('historyMessageId',v_history,'admittedNew',true);
END;
$admit_once$;
REVOKE ALL ON FUNCTION public.admit_cos_customer_task_once(uuid,uuid,uuid,text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_cos_customer_task_once(uuid,uuid,uuid,text,text)
  TO service_role;
