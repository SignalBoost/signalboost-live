-- Disposable PostgreSQL regression for the existing builder_jobs task-store extension.
ALTER TABLE public.builder_jobs ADD COLUMN objective text NOT NULL DEFAULT 'original objective';
ALTER TABLE public.builder_jobs ADD CONSTRAINT builder_jobs_kind_check CHECK (job_kind IN ('standard','debug_file'));
\ir ../../supabase/migrations/20261029153500_customer_task_record_foundation.sql
BEGIN;
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
ROLLBACK;
