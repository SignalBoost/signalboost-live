-- Builder V2 checkpoint persistence: old function rejected version=2 after V2 saved receipts.
-- Keep version separation and claim fencing; never convert a legacy V1 job.
create or replace function public.pause_builder_job_slice(
  p_job_id uuid, p_user_id uuid, p_generation integer, p_checkpoint jsonb, p_reply text, p_result jsonb
) returns boolean language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_job public.builder_jobs;
begin
  if p_checkpoint is null or p_checkpoint->>'version' not in ('1', '2') then
    raise exception 'builder_checkpoint_invalid';
  end if;
  update public.builder_jobs
  set status = 'paused', checkpoint = p_checkpoint, result = p_result, updated_at = now()
  where id = p_job_id and user_id = p_user_id and status = 'running'
    and claim_generation = p_generation and claim_generation < 24
    and job_kind = 'standard'
    and coalesce((metadata->>'platformRepair')::boolean, false) = false
    and p_checkpoint->>'workspaceId' = workspace_id::text
    and (
      (p_checkpoint->>'version' = '1' and coalesce(metadata->>'builderEngine','v1') <> 'v2')
      or (p_checkpoint->>'version' = '2' and metadata->>'builderEngine' = 'v2')
    )
  returning * into v_job;
  if not found then return false; end if;
  update public.assistant_messages
  set content = left(p_reply, 16000), provenance = jsonb_build_object(
    'schema', 'signalboost-builder-job-v1', 'jobId', p_job_id,
    'workspaceId', v_job.workspace_id, 'status', 'paused'
  ) where id = v_job.history_message_id and user_id = p_user_id;
  update public.assistant_conversations set updated_at = now()
  where id = v_job.conversation_id and user_id = p_user_id;
  return true;
end;
$function$;
