-- Run with service-role privileges. Entire fixture, including History, is rolled back.
begin;
set local role service_role;
do $$
declare
  v_workspace uuid;
  v_user uuid;
  v_job uuid := gen_random_uuid();
  v_conversation uuid := gen_random_uuid();
  v_claim public.builder_jobs;
  v_checkpoint jsonb;
  v_count integer;
  v_generation integer;
begin
  select id, user_id into v_workspace, v_user from public.builder_workspaces limit 1;
  if v_workspace is null then raise exception 'test requires an existing workspace'; end if;
  perform public.enqueue_builder_job(v_job, v_workspace, v_user, v_conversation,
    'Checkpoint SQL regression fixture', 'standard', '{}'::jsonb, false, 'Queued fixture');
  select count(*) into v_count from public.claim_builder_job_slice(v_job, gen_random_uuid());
  if v_count <> 0 then raise exception 'cross-user claim'; end if;
  select * into v_claim from public.claim_builder_job_slice(v_job, v_user);
  if v_claim.claim_generation <> 1 then raise exception 'first claim generation'; end if;
  select count(*) into v_count from public.claim_builder_job_slice(v_job, v_user);
  if v_count <> 0 then raise exception 'duplicate running claim'; end if;
  v_checkpoint := jsonb_build_object('version', 1, 'workspaceId', v_workspace);
  for v_generation in 1..3 loop
    if not public.pause_builder_job_slice(v_job, v_user, v_generation, v_checkpoint,
      'Saved fixture', '{"trace":[{"toolId":"run","ok":false,"exitCode":1}]}'::jsonb) then
      raise exception 'checkpoint not saved';
    end if;
    select * into v_claim from public.claim_builder_job_slice(v_job, v_user);
    if v_claim.claim_generation <> v_generation + 1 or v_claim.checkpoint <> v_checkpoint then
      raise exception 'checkpoint not restored';
    end if;
    perform public.finish_builder_job_slice(v_job, v_user, v_generation, 'succeeded', 'Stale worker', '{}'::jsonb, null);
    perform public.finish_builder_job(v_job, v_user, 'succeeded', 'Legacy worker', '{}'::jsonb, null);
    if (select status from public.builder_jobs where id = v_job) <> 'running' then
      raise exception 'old worker overwrote new claim';
    end if;
    if public.pause_builder_job_slice(v_job, v_user, v_generation, v_checkpoint, 'Stale checkpoint', '{}'::jsonb) then
      raise exception 'old worker checkpoint accepted';
    end if;
  end loop;
  if public.pause_builder_job_slice(v_job, v_user, 4, v_checkpoint, 'Over budget', '{}'::jsonb) then
    raise exception 'continuation limit bypassed';
  end if;
  -- A lost worker must retain previous saved evidence and may never be automatically resumed.
  perform public.expire_stale_builder_jobs(v_user, now() + interval '1 minute', v_job, null);
  if (select result->'trace'->0->>'exitCode' from public.builder_jobs where id = v_job) <> '1' then
    raise exception 'saved proof lost on worker expiration';
  end if;
  select count(*) into v_count from public.claim_builder_job_slice(v_job, v_user);
  if v_count <> 0 then raise exception 'lost worker replayed'; end if;
  if (select provenance->>'status' from public.assistant_messages where id = v_claim.history_message_id) <> 'failed' then
    raise exception 'history not terminal';
  end if;
  v_job := gen_random_uuid();
  perform public.enqueue_builder_job(v_job, v_workspace, v_user, v_conversation,
    'Checkpoint SQL regression fixture', 'standard', '{}'::jsonb, false, 'Queued fixture');
  select * into v_claim from public.claim_builder_job_slice(v_job, v_user);
  perform public.pause_builder_job_slice(v_job, v_user, 1, v_checkpoint, 'Saved fixture', '{}'::jsonb);
  select * into v_claim from public.claim_builder_job_slice(v_job, v_user);
  perform public.finish_builder_job_slice(v_job, gen_random_uuid(), 2, 'succeeded', 'Wrong user', '{}'::jsonb, null);
  if (select status from public.builder_jobs where id = v_job) <> 'running' then
    raise exception 'cross-user finish';
  end if;
  perform public.finish_builder_job_slice(v_job, v_user, 2, 'succeeded', 'Verified fixture', '{"trace":[{"exitCode":0}]}'::jsonb, null);
  select * into v_claim from public.builder_jobs where id = v_job;
  if v_claim.status <> 'succeeded' or v_claim.checkpoint is not null or v_claim.result->'trace'->0->>'exitCode' <> '0' then
    raise exception 'terminal result not saved or checkpoint not cleared';
  end if;
  if (select content from public.assistant_messages where id = v_claim.history_message_id) <> 'Verified fixture' then
    raise exception 'verified result missing from History';
  end if;
end;
$$;
select 'claim isolation, exclusive claims, checkpoint restore, stale-worker fencing, four-slice limit, retained evidence and History: passed' as verification;
rollback;
