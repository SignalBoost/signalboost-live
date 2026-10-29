-- Admit a durable COS request atomically into the existing canonical builder_jobs table.
-- Requires customer_task_record_foundation migration. Service-role only.
CREATE OR REPLACE FUNCTION public.admit_cos_customer_task(
 p_task_id uuid, p_user_id uuid, p_conversation_id uuid, p_objective text, p_running_reply text
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $admit$
DECLARE v_history uuid; v_existing public.builder_jobs%ROWTYPE; v_owner uuid;
BEGIN
 IF p_task_id IS NULL OR p_user_id IS NULL OR p_conversation_id IS NULL
   OR length(btrim(coalesce(p_objective,''))) < 1
   OR length(p_objective) > 16000 THEN
   RAISE EXCEPTION 'cos_task_invalid_admission' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_task_id::text, 0));
 -- A repeated task ID must never silently change owner, conversation or objective.
 SELECT * INTO v_existing FROM public.builder_jobs WHERE id=p_task_id;
 IF FOUND THEN
   IF v_existing.user_id <> p_user_id OR v_existing.conversation_id <> p_conversation_id
      OR v_existing.objective <> btrim(p_objective) OR v_existing.job_kind <> 'cos_turn'
      OR v_existing.history_message_id IS NULL THEN
     RAISE EXCEPTION 'cos_task_identity_conflict' USING ERRCODE='23505';
   END IF;
   RETURN v_existing.history_message_id;
 END IF;
 SELECT user_id INTO v_owner FROM public.assistant_conversations WHERE id=p_conversation_id;
 IF FOUND AND v_owner <> p_user_id THEN
   RAISE EXCEPTION 'cos_task_conversation_ownership_mismatch' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.assistant_conversations(id,user_id,title,message_count)
 VALUES (p_conversation_id,p_user_id,left(btrim(p_objective),80),0)
 ON CONFLICT (id) DO NOTHING;
 -- Recheck after a concurrent create, before writing any data.
 IF NOT EXISTS (SELECT 1 FROM public.assistant_conversations
                WHERE id=p_conversation_id AND user_id=p_user_id) THEN
   RAISE EXCEPTION 'cos_task_conversation_ownership_mismatch' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.builder_workspaces(id,user_id,objective)
 VALUES (p_task_id,p_user_id,left(btrim(p_objective),500))
 ON CONFLICT (id) DO NOTHING;
 IF NOT EXISTS (SELECT 1 FROM public.builder_workspaces
                WHERE id=p_task_id AND user_id=p_user_id) THEN
   RAISE EXCEPTION 'cos_task_workspace_ownership_mismatch' USING ERRCODE='42501';
 END IF;
 INSERT INTO public.assistant_messages(conversation_id,user_id,role,content)
 VALUES (p_conversation_id,p_user_id,'user',left(btrim(p_objective),16000));
 INSERT INTO public.assistant_messages(conversation_id,user_id,role,content,provenance)
 VALUES (p_conversation_id,p_user_id,'assistant',left(btrim(coalesce(p_running_reply,'')),4000),
   jsonb_build_object('schema','signalboost-cos-turn-v1','turnId',p_task_id::text,'status','running','startedAt',now()))
 RETURNING id INTO v_history;
 INSERT INTO public.builder_jobs(id,workspace_id,user_id,conversation_id,objective,job_kind,
  metadata,owner_authorized,status,history_message_id,task_contract,plan_version)
 VALUES (p_task_id,p_task_id,p_user_id,p_conversation_id,btrim(p_objective),'cos_turn',
   '{}'::jsonb,false,'running',v_history,'{}'::jsonb,1);
 UPDATE public.assistant_conversations SET message_count=message_count+2,updated_at=now()
 WHERE id=p_conversation_id AND user_id=p_user_id;
 RETURN v_history;
END
$admit$;
REVOKE ALL ON FUNCTION public.admit_cos_customer_task(uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admit_cos_customer_task(uuid,uuid,uuid,text,text) TO service_role;
