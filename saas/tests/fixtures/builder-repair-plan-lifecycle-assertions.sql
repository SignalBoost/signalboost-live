-- Gate 5: disposable real PostgreSQL claim/pause/reclaim acceptance.
-- Run only after builder-recovery-schema and customer-task-foundation-assertions.
ALTER TABLE public.builder_jobs ADD COLUMN IF NOT EXISTS owner_authorized boolean NOT NULL DEFAULT false;
ALTER TABLE public.builder_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
\ir ../../supabase/migrations/20261028130000_builder_repository_repair_v2_continuation.sql
BEGIN;
INSERT INTO public.assistant_conversations (id,user_id,updated_at)
VALUES ('29000000-0000-4000-8000-000000000003','29000000-0000-4000-8000-000000000001',now());
INSERT INTO public.assistant_messages (id,user_id,content,provenance)
VALUES ('29000000-0000-4000-8000-000000000004','29000000-0000-4000-8000-000000000001','Running','{}'::jsonb);
INSERT INTO public.builder_jobs (id,workspace_id,conversation_id,user_id,history_message_id,objective,job_kind,metadata,owner_authorized,status,claim_generation,updated_at)
VALUES ('29000000-0000-4000-8000-000000000005','29000000-0000-4000-8000-000000000002','29000000-0000-4000-8000-000000000003','29000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000004','Original customer request','standard','{"platformRepair":true,"builderEngine":"v2","repairExecutionObjective":"current-head repair execution","repairPlanVersion":2,"builderRunLimits":{"budgetUsd":0.5}}'::jsonb,true,'queued',0,now());
DO $gate5$
DECLARE v_job public.builder_jobs;
BEGIN
SELECT * INTO v_job FROM public.builder_jobs WHERE id='29000000-0000-4000-8000-000000000005';
IF v_job.plan_version<>2 OR v_job.objective<>'Original customer request' OR v_job.owner_authorized IS DISTINCT FROM true THEN
 RAISE EXCEPTION 'Gate5 admission objective/version/authority mismatch';
END IF;
SELECT * INTO v_job FROM public.claim_builder_job_slice(v_job.id,v_job.user_id);
IF v_job.id IS NULL OR v_job.claim_generation<>1 THEN RAISE EXCEPTION 'Gate5 first claim failed'; END IF;
IF EXISTS(SELECT 1 FROM public.claim_builder_job_slice(v_job.id,v_job.user_id)) THEN RAISE EXCEPTION 'Gate5 duplicate claim accepted'; END IF;
IF public.pause_builder_job_slice(v_job.id,v_job.user_id,0,'{"version":2,"workspaceId":"29000000-0000-4000-8000-000000000002","repositoryRepair":{"phase":"failed-command"}}'::jsonb,'Progress','{}'::jsonb) THEN
 RAISE EXCEPTION 'Gate5 stale worker checkpoint accepted';
END IF;
IF NOT public.pause_builder_job_slice(v_job.id,v_job.user_id,1,'{"version":2,"workspaceId":"29000000-0000-4000-8000-000000000002","repositoryRepair":{"phase":"failed-command"}}'::jsonb,'Progress','{}'::jsonb) THEN
 RAISE EXCEPTION 'Gate5 checkpoint failed';
END IF;
SELECT * INTO v_job FROM public.claim_builder_job_slice(v_job.id,v_job.user_id);
IF v_job.id IS NULL OR v_job.claim_generation<>2 OR v_job.plan_version<>2
 OR v_job.objective<>'Original customer request' OR v_job.owner_authorized IS DISTINCT FROM true
 OR v_job.metadata->'builderRunLimits'<>'{"budgetUsd":0.5}'::jsonb
 OR v_job.metadata->>'repairExecutionObjective'<>'current-head repair execution' THEN
 RAISE EXCEPTION 'Gate5 re-claim lost identity, objective, plan, budget or authority';
END IF;
IF (SELECT count(*) FROM public.builder_jobs WHERE id=v_job.id)<>1 THEN RAISE EXCEPTION 'Gate5 duplicate task created'; END IF;
UPDATE public.builder_jobs SET status='succeeded',checkpoint=NULL,result='{"verification":"independent-test-fixture"}'::jsonb WHERE id=v_job.id AND claim_generation=2;
IF (SELECT status FROM public.builder_jobs WHERE id=v_job.id)<>'succeeded' THEN RAISE EXCEPTION 'Gate5 final transition failed'; END IF;
END $gate5$;
ROLLBACK;
