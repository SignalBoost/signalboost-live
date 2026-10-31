-- saas/tests/fixtures/cos-task-single-dispatch-assertions.sql
-- Gate 1, real disposable PostgreSQL: one send = one customer task. A replay of the same task id re-attaches to the
-- original task and History receipt, reports admittedNew=false (so no second worker is dispatched), and can never
-- change owner, conversation or objective. Uses the CI fixture tables; NEVER run against customer/production databases.
-- Columns the production tables have and the admission RPC writes; the shared fixture schema is minimal.
ALTER TABLE public.assistant_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;
ALTER TABLE public.assistant_messages ADD COLUMN IF NOT EXISTS role text;
ALTER TABLE public.assistant_messages ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.assistant_conversations ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.assistant_conversations ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.builder_jobs ADD COLUMN IF NOT EXISTS owner_authorized boolean NOT NULL DEFAULT false;
ALTER TABLE public.builder_jobs ALTER COLUMN claim_generation SET DEFAULT 0;
ALTER TABLE public.builder_jobs ALTER COLUMN updated_at SET DEFAULT now();
CREATE TABLE IF NOT EXISTS public.builder_workspaces (id uuid PRIMARY KEY, user_id uuid NOT NULL, objective text);
\ir ../../supabase/migrations/20261029161500_cos_canonical_task_admission.sql
\ir ../../supabase/migrations/20261030233000_cos_task_single_dispatch_admission.sql
\ir ../../supabase/migrations/20261030190000_cos_canonical_task_contract.sql
DO $single_dispatch$
DECLARE
  v_first jsonb; v_replay jsonb; v_jobs int; v_messages int;
  v_task uuid := '50000000-0000-4000-8000-000000000001';
  v_user uuid := '50000000-0000-4000-8000-000000000002';
  v_conversation uuid := '50000000-0000-4000-8000-000000000003';
BEGIN
  v_first := public.admit_cos_customer_task_once(v_task, v_user, v_conversation, 'What is the capital of Germany?', 'Working on it');
  IF (v_first->>'admittedNew')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'first admission must report a new task: %', v_first;
  END IF;
  v_replay := public.admit_cos_customer_task_once(v_task, v_user, v_conversation, 'What is the capital of Germany?', 'Working on it');
  IF (v_replay->>'admittedNew')::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'replay must not report a new task (it would dispatch a second worker): %', v_replay;
  END IF;
  IF v_replay->>'historyMessageId' IS DISTINCT FROM v_first->>'historyMessageId' THEN
    RAISE EXCEPTION 'replay must re-attach to the original History receipt';
  END IF;
  SELECT count(*) INTO v_jobs FROM public.builder_jobs WHERE id = v_task AND job_kind = 'cos_turn';
  SELECT count(*) INTO v_messages FROM public.assistant_messages WHERE conversation_id = v_conversation;
  IF v_jobs <> 1 OR v_messages <> 2 THEN
    RAISE EXCEPTION 'one send must create exactly one task and one History pair (jobs=%, messages=%)', v_jobs, v_messages;
  END IF;
  IF (SELECT task_contract->>'immutable_objective' FROM public.builder_jobs WHERE id = v_task) <> 'What is the capital of Germany?' THEN
    RAISE EXCEPTION 'admitted task lacks its canonical contract';
  END IF;
  -- The same id can never be reused for another objective, owner or conversation.
  BEGIN
    PERFORM public.admit_cos_customer_task_once(v_task, v_user, v_conversation, 'A different request', 'Working on it');
    RAISE EXCEPTION 'replay with a changed objective was accepted';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%cos_task_identity_conflict%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.admit_cos_customer_task_once(v_task, '50000000-0000-4000-8000-000000000009', v_conversation, 'What is the capital of Germany?', 'x');
    RAISE EXCEPTION 'replay by another user was accepted';
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE '%cos_task_identity_conflict%' THEN RAISE; END IF;
  END;
  -- The admitted task finishes once, with History provenance keeping the reasoner turn id beside the task id.
  IF NOT public.finish_cos_customer_task(v_task, (v_first->>'historyMessageId')::uuid, v_user, 'succeeded', 'Berlin.',
    jsonb_build_object('schema','signalboost-cos-turn-v1','turnId',v_task::text,'status','succeeded','cosTurnId','reasoner-turn-1','response_source','cos-primary')) THEN
    RAISE EXCEPTION 'admitted task did not finish';
  END IF;
  IF (SELECT status FROM public.builder_jobs WHERE id = v_task) <> 'succeeded'
     OR (SELECT provenance->>'cosTurnId' FROM public.assistant_messages WHERE id = (v_first->>'historyMessageId')::uuid) <> 'reasoner-turn-1' THEN
    RAISE EXCEPTION 'finished task or History provenance is wrong';
  END IF;
END
$single_dispatch$;
