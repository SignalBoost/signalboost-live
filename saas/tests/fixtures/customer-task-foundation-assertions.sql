-- Disposable PostgreSQL regression for the existing builder_jobs task-store extension.
ALTER TABLE public.builder_jobs ADD COLUMN objective text NOT NULL DEFAULT 'original objective';
ALTER TABLE public.builder_jobs ADD CONSTRAINT builder_jobs_kind_check CHECK (job_kind IN ('standard','debug_file'));
\ir ../../supabase/migrations/20261029153500_customer_task_record_foundation.sql
\ir ../../supabase/migrations/20261029230000_cos_customer_task_atomic_finish.sql
\ir ../../supabase/migrations/20261029233500_builder_repair_plan_atomic_admission.sql
BEGIN;
-- Replan version is visible on the first canonical task insert, not a later update.
INSERT INTO public.builder_jobs(id,user_id,status,claim_generation,job_kind,updated_at,objective,metadata)
VALUES ('40000000-0000-0000-0000-000000000093','20000000-0000-0000-0000-000000000001','queued',0,'standard',now(),'unchanged customer request',
'{"platformRepair":true,"repairExecutionObjective":"verified head proof","repairPlanVersion":2}'::jsonb);
DO $plan_assert$
BEGIN
 IF (SELECT plan_version FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000093') <> 2 THEN
   RAISE EXCEPTION 'Replanned job was admitted with wrong version';
 END IF;
 IF (SELECT objective FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000093') <> 'unchanged customer request' THEN
   RAISE EXCEPTION 'Replan rewrote original customer request';
 END IF;
END
$plan_assert$;
INSERT INTO public.builder_jobs(id,user_id,status,claim_generation,job_kind,updated_at,objective)
VALUES ('40000000-0000-0000-0000-000000000091','20000000-0000-0000-0000-000000000001','queued',0,'cos_turn',now(),'original objective');
DO $assert$
BEGIN
 IF (SELECT plan_version FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000091') <> 1 THEN
   RAISE EXCEPTION 'Missing initial plan version';
 END IF;
 IF (SELECT task_contract FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000091') <> '{}'::jsonb THEN
   RAISE EXCEPTION 'Missing initial task contract';
 END IF;
END
$assert$;
DO $assert$
BEGIN
 BEGIN
   UPDATE public.builder_jobs SET objective='changed objective' WHERE id='40000000-0000-0000-0000-000000000091';
   RAISE EXCEPTION 'Objective mutation was allowed';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM NOT LIKE '%customer_task_objective_immutable%' THEN RAISE; END IF;
 END;
 BEGIN
   UPDATE public.builder_jobs SET status='running', claim_generation=1 WHERE id='40000000-0000-0000-0000-000000000091';
   RAISE EXCEPTION 'COS task was claimed by Builder';
 EXCEPTION WHEN check_violation THEN
   IF SQLERRM NOT LIKE '%cos_task_not_builder_executable%' THEN RAISE; END IF;
 END;
END
$assert$;

-- The canonical task and History must advance together or neither may advance.
ALTER TABLE public.assistant_messages ADD COLUMN role text;
INSERT INTO public.assistant_messages(id,user_id,role,content,provenance)
VALUES ('50000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000001',
'assistant','Running','{"schema":"signalboost-cos-turn-v1","turnId":"40000000-0000-0000-0000-000000000092","status":"running"}');
INSERT INTO public.builder_jobs(id,user_id,status,claim_generation,job_kind,updated_at,objective,history_message_id)
VALUES ('40000000-0000-0000-0000-000000000092','20000000-0000-0000-0000-000000000001',
'running',0,'cos_turn',now(),'original objective','50000000-0000-0000-0000-000000000092');
DO $atomic$
DECLARE result boolean;
BEGIN
  BEGIN
    PERFORM public.finish_cos_customer_task(
      '40000000-0000-0000-0000-000000000092',
      '50000000-0000-0000-0000-000000000092',
      '20000000-0000-0000-0000-000000000001',
      'succeeded','Completed',
      '{"schema":"signalboost-cos-turn-v1","turnId":"40000000-0000-0000-0000-000000000092","status":"failed"}',null);
    RAISE EXCEPTION 'Invalid provenance accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF (SELECT status FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000092') <> 'running' THEN
    RAISE EXCEPTION 'Task transitioned despite invalid input';
  END IF;

  UPDATE public.assistant_messages SET provenance =
    '{"schema":"signalboost-cos-turn-v1","turnId":"40000000-0000-0000-0000-000000000092","status":"failed"}'
  WHERE id='50000000-0000-0000-0000-000000000092';
  BEGIN
    PERFORM public.finish_cos_customer_task(
      '40000000-0000-0000-0000-000000000092',
      '50000000-0000-0000-0000-000000000092',
      '20000000-0000-0000-0000-000000000001',
      'succeeded','Completed',
      '{"schema":"signalboost-cos-turn-v1","turnId":"40000000-0000-0000-0000-000000000092","status":"succeeded"}',null);
    RAISE EXCEPTION 'Mismatched History row accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF (SELECT status FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000092') <> 'running' THEN
    RAISE EXCEPTION 'Task advanced after History write failure';
  END IF;
  UPDATE public.assistant_messages SET provenance =
    '{"schema":"signalboost-cos-turn-v1","turnId":"40000000-0000-0000-0000-000000000092","status":"running"}'
  WHERE id='50000000-0000-0000-0000-000000000092';

  SELECT public.finish_cos_customer_task(
    '40000000-0000-0000-0000-000000000092',
    '50000000-0000-0000-0000-000000000092',
    '20000000-0000-0000-0000-000000000001',
    'succeeded','Completed',
    '{"schema":"signalboost-cos-turn-v1","turnId":"40000000-0000-0000-0000-000000000092","status":"succeeded"}',null)
    INTO result;
  IF result IS DISTINCT FROM true OR
    (SELECT status FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000092') <> 'succeeded' OR
    (SELECT provenance->>'status' FROM public.assistant_messages WHERE id='50000000-0000-0000-0000-000000000092') <> 'succeeded' THEN
    RAISE EXCEPTION 'Atomic COS completion did not commit both records';
  END IF;
END
$atomic$;

ROLLBACK;
