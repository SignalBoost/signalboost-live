-- Gate 1, real disposable PostgreSQL: COS parent -> Builder child -> History receipt.
-- Uses the CI fixture tables; NEVER run against customer/production databases.
\ir ../../supabase/migrations/20261029235900_builder_customer_task_parent_link.sql
\ir ../../supabase/migrations/20261030160000_immutable_builder_customer_task_parent.sql
ALTER TABLE public.assistant_messages ADD COLUMN IF NOT EXISTS role text;
BEGIN;
INSERT INTO public.assistant_conversations(id,user_id,updated_at)
VALUES ('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001',now());
INSERT INTO public.assistant_messages(id,user_id,role,content,provenance)
VALUES ('30000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','assistant','Working',
'{"schema":"signalboost-cos-turn-v1","turnId":"30000000-0000-4000-8000-000000000005","status":"running"}');
INSERT INTO public.builder_jobs(id,user_id,workspace_id,conversation_id,history_message_id,status,claim_generation,job_kind,updated_at,objective,metadata)
VALUES ('30000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004','running',0,'cos_turn',now(),'Build and verify calculator','{}'::jsonb);
INSERT INTO public.builder_jobs(id,user_id,workspace_id,conversation_id,status,claim_generation,job_kind,updated_at,objective,metadata)
VALUES ('30000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','queued',0,'standard',now(),'Implement calculator',
'{"customerTaskId":"30000000-0000-4000-8000-000000000005"}'::jsonb);
DO $gate1$
DECLARE v_count int; v_completed boolean;
BEGIN
 SELECT count(*) INTO v_count FROM public.builder_jobs child
 JOIN public.builder_jobs parent ON parent.id=(child.metadata->>'customerTaskId')::uuid
 JOIN public.assistant_messages receipt ON receipt.id=parent.history_message_id
 WHERE child.id='30000000-0000-4000-8000-000000000006'
  AND parent.id='30000000-0000-4000-8000-000000000005'
  AND parent.user_id=child.user_id AND parent.conversation_id=child.conversation_id
  AND receipt.provenance->>'turnId'=parent.id::text;
 IF v_count<>1 THEN RAISE EXCEPTION 'Gate 1 linked execution and History receipt missing'; END IF;
 BEGIN
  UPDATE public.builder_jobs SET metadata='{"customerTaskId":"30000000-0000-4000-8000-000000000007"}'::jsonb
  WHERE id='30000000-0000-4000-8000-000000000006';
  RAISE EXCEPTION 'Gate 1 parent relink accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%builder_customer_task_parent_immutable%' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.builder_jobs(id,user_id,workspace_id,conversation_id,status,claim_generation,job_kind,updated_at,objective,metadata)
  VALUES ('30000000-0000-4000-8000-000000000007','30000000-0000-4000-8000-000000000008','30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','queued',0,'standard',now(),'Wrong owner',
   '{"customerTaskId":"30000000-0000-4000-8000-000000000005"}'::jsonb);
  RAISE EXCEPTION 'Gate 1 wrong-owner delegation accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE '%builder_customer_task_ownership_mismatch%' THEN RAISE; END IF;
 END;
 v_completed := public.finish_cos_customer_task(
  '30000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000004',
  '30000000-0000-4000-8000-000000000001','succeeded','Calculator delegated',
  '{"schema":"signalboost-cos-turn-v1","turnId":"30000000-0000-4000-8000-000000000005","status":"succeeded"}'::jsonb,null);
 IF v_completed IS DISTINCT FROM true
    OR (SELECT status FROM public.builder_jobs WHERE id='30000000-0000-4000-8000-000000000005')<>'succeeded'
    OR (SELECT provenance->>'status' FROM public.assistant_messages WHERE id='30000000-0000-4000-8000-000000000004')<>'succeeded'
 THEN RAISE EXCEPTION 'Gate 1 atomic COS and History finish not observed'; END IF;
END $gate1$;
ROLLBACK;
