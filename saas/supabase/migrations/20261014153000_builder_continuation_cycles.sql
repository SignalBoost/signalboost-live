-- Cycle productive Builder checkpoints onto the existing authenticated paused-job cron.
-- Generation fencing prevents duplicate workers; the total job age and cycle count prevent infinite loops.
create or replace function public.requeue_builder_continuation_cycle(
  p_job_id uuid, p_user_id uuid, p_generation integer, p_checkpoint jsonb, p_reply text, p_result jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_job public.builder_jobs;
  v_cycles integer;
begin
  if p_checkpoint is null or p_checkpoint->>'version' is distinct from '1' then
    raise exception 'builder_checkpoint_invalid';
  end if;
  select * into v_job from public.builder_jobs
    where id = p_job_id and user_id = p_user_id and status = 'running'
      and claim_generation = p_generation and job_kind = 'standard'
      and coalesce((metadata->>'platformRepair')::boolean, false) = false
    for update;
  if not found or p_generation < 24 or p_checkpoint->>'workspaceId' is distinct from v_job.workspace_id::text then
    return false;
  end if;
  v_cycles := case when coalesce(v_job.metadata->>'continuationCycles','') ~ '^[0-9]+$'
    then (v_job.metadata->>'continuationCycles')::integer else 0 end;
  if v_cycles >= 2 or v_job.created_at < now() - interval '90 minutes' then
    return false;
  end if;
  update public.builder_jobs
    set status = 'paused', claim_generation = 0, checkpoint = p_checkpoint,
        result = p_result, error = null, started_at = null, finished_at = null,
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'continuationCycles',v_cycles + 1,'continuationCycleAt',now()),
        updated_at = now()
    where id = p_job_id and user_id = p_user_id and status = 'running'
      and claim_generation = p_generation;
  if not found then return false; end if;
  update public.assistant_messages
    set content = left(p_reply,16000), provenance = jsonb_build_object(
      'schema','signalboost-builder-job-v1','jobId',p_job_id,
      'workspaceId',v_job.workspace_id,'status','paused')
    where id = v_job.history_message_id and user_id = p_user_id;
  return true;
end;
$$;
revoke all on function public.requeue_builder_continuation_cycle(uuid,uuid,integer,jsonb,text,jsonb) from public, anon, authenticated;
grant execute on function public.requeue_builder_continuation_cycle(uuid,uuid,integer,jsonb,text,jsonb) to service_role;
