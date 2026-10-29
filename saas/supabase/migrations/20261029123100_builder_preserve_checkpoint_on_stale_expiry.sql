-- Preserve resumable Builder claims during stale-worker terminalization.
-- Only claims not eligible for checkpoint resume, with an expired heartbeat, may become worker_lost.
-- Requeue checkpointed claims through the existing fenced continuation RPC.
create or replace function public.expire_stale_builder_jobs(
  p_user_id uuid,
  p_cutoff timestamptz,
  p_job_id uuid,
  p_conversation_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job record;
  v_reply text := 'COS Builder stopped: builder_job_worker_lost. The background worker did not reach a terminal result before its execution lease expired. No Builder POST was replayed.';
  v_count integer := 0;
begin
  if p_user_id is null or p_cutoff is null then
    raise exception 'builder_job_stale_recovery_invalid_scope';
  end if;

  for v_job in
    select id, workspace_id, conversation_id, history_message_id, result
    from public.builder_jobs
    where user_id = p_user_id
      and status = 'running' and claim_generation > 0
      and (checkpoint is null or job_kind <> 'standard' or claim_generation >= 24 or coalesce((metadata->>'builderStaleRequeues')::integer, 0) >= 3)
      and greatest(updated_at, coalesce(last_heartbeat_at, updated_at)) <= p_cutoff
      and (p_job_id is null or id = p_job_id)
      and (p_conversation_id is null or conversation_id = p_conversation_id)
    order by updated_at asc
    for update skip locked
  loop
    update public.builder_jobs
    set status = 'failed',
        result = jsonb_build_object(
          'jobId', v_job.id,
          'workspaceId', v_job.workspace_id,
          'status', 'failed',
          'error', 'builder_job_worker_lost',
          'reply', v_reply,
          'files', coalesce(v_job.result->'files', '[]'::jsonb),
          'trace', coalesce(v_job.result->'trace', '[]'::jsonb)
        ),
        error = 'builder_job_worker_lost',
        finished_at = now(),
        updated_at = now()
    where id = v_job.id
      and user_id = p_user_id
      and status = 'running' and claim_generation > 0
      and (checkpoint is null or job_kind <> 'standard' or claim_generation >= 24 or coalesce((metadata->>'builderStaleRequeues')::integer, 0) >= 3)
      and greatest(updated_at, coalesce(last_heartbeat_at, updated_at)) <= p_cutoff;

    if not found then
      continue;
    end if;

    update public.assistant_messages
    set content = v_reply,
        provenance = jsonb_build_object(
          'schema', 'signalboost-builder-job-v1',
          'jobId', v_job.id,
          'workspaceId', v_job.workspace_id,
          'status', 'failed',
          'error', 'builder_job_worker_lost'
        )
    where id = v_job.history_message_id
      and user_id = p_user_id;

    update public.assistant_conversations
    set updated_at = now()
    where id = v_job.conversation_id
      and user_id = p_user_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.expire_stale_builder_jobs(uuid, timestamptz, uuid, uuid) is
  'Service-role-only Builder execution-lease reconciliation. Converts stale running jobs not eligible for further continuation to worker-loss; preserves resumable checkpoints and fresh heartbeats.';

revoke all on function public.expire_stale_builder_jobs(uuid, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.expire_stale_builder_jobs(uuid, timestamptz, uuid, uuid) to service_role;
