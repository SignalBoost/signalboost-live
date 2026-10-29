-- Executed after applying the real 20261029145000 function, in disposable CI Postgres.
BEGIN;
INSERT INTO public.assistant_conversations VALUES ('10000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',now());
INSERT INTO public.assistant_messages VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','pending',null);
INSERT INTO public.builder_jobs(id,user_id,workspace_id,conversation_id,history_message_id,status,claim_generation,job_kind,checkpoint,metadata,updated_at,last_heartbeat_at)
VALUES
('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',null,'10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','running',1,'standard',null,'{}',now()-interval '1 hour',now()),
('40000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000001',null,null,null,'running',1,'standard','{"step":1}','{}',now()-interval '1 hour',now()-interval '1 hour'),
('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001',null,null,null,'running',24,'standard','{"step":1}','{}',now()-interval '1 hour',now()-interval '1 hour'),
('40000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001',null,'10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','running',1,'standard',null,'{}',now()-interval '1 hour',now()-interval '1 hour');
DO $$
DECLARE count_expired integer;
BEGIN
 SELECT public.expire_stale_builder_jobs('20000000-0000-0000-0000-000000000001',now()-interval '10 minutes',null,null) INTO count_expired;
 IF count_expired <> 2 THEN RAISE EXCEPTION 'Expected 2 expired jobs, got %', count_expired; END IF;
 IF (SELECT status FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000001') <> 'running' THEN RAISE EXCEPTION 'Fresh heartbeat job incorrectly expired'; END IF;
 IF (SELECT status FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000002') <> 'running' THEN RAISE EXCEPTION 'Recoverable checkpoint incorrectly expired'; END IF;
 IF (SELECT status FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000003') <> 'failed' THEN RAISE EXCEPTION 'Exhausted checkpoint not expired'; END IF;
 IF (SELECT status FROM public.builder_jobs WHERE id='40000000-0000-0000-0000-000000000004') <> 'failed' THEN RAISE EXCEPTION 'Abandoned claim not expired'; END IF;
 IF (SELECT provenance->>'error' FROM public.assistant_messages WHERE id='30000000-0000-0000-0000-000000000001') <> 'builder_job_worker_lost' THEN RAISE EXCEPTION 'History not updated'; END IF;
END $$;
ROLLBACK;
