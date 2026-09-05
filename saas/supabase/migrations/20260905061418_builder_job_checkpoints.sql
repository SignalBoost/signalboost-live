-- Safe, server-only continuation. Old workers can finish only legacy (generation 0) claims.
alter table public.builder_jobs
  add column claim_generation integer not null default 0 check (claim_generation between 0 and 4),
  add column checkpoint jsonb;
alter table public.builder_jobs drop constraint builder_jobs_status_check;
alter table public.builder_jobs add constraint builder_jobs_status_check
  check (status in ('queued', 'running', 'paused', 'succeeded', 'failed'));
alter table public.builder_jobs add constraint builder_jobs_checkpoint_check check (
  checkpoint is null or (jsonb_typeof(checkpoint) = 'object' and octet_length(checkpoint::text) <= 4500000)
);

create or replace function public.claim_builder_job_slice(p_job_id uuid, p_user_id uuid)
returns setof public.builder_jobs language sql security invoker set search_path = public, pg_temp as $$
  update public.builder_jobs
  set status = 'running', claim_generation = claim_generation + 1,
      started_at = coalesce(started_at, now()), updated_at = now()
  where id = p_job_id and user_id = p_user_id and claim_generation < 4
    and (status = 'queued' or (status = 'paused' and checkpoint is not null
      and job_kind = 'standard' and coalesce((metadata->>'platformRepair')::boolean, false) = false))
  returning *;
$$;

create or replace function public.pause_builder_job_slice(
  p_job_id uuid, p_user_id uuid, p_generation integer, p_checkpoint jsonb, p_reply text, p_result jsonb
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_job public.builder_jobs;
begin
  if p_checkpoint is null or p_checkpoint->>'version' is distinct from '1' then
    raise exception 'builder_checkpoint_invalid';
  end if;
  update public.builder_jobs
  set status = 'paused', checkpoint = p_checkpoint, result = p_result, updated_at = now()
  where id = p_job_id and user_id = p_user_id and status = 'running'
    and claim_generation = p_generation and claim_generation < 4
    and job_kind = 'standard' and coalesce((metadata->>'platformRepair')::boolean, false) = false
    and p_checkpoint->>'workspaceId' = workspace_id::text
  returning * into v_job;
  if not found then return false; end if;
  update public.assistant_messages set content = left(p_reply, 16000), provenance = jsonb_build_object(
    'schema', 'signalboost-builder-job-v1', 'jobId', p_job_id, 'workspaceId', v_job.workspace_id, 'status', 'paused'
  ) where id = v_job.history_message_id and user_id = p_user_id;
  update public.assistant_conversations set updated_at = now()
  where id = v_job.conversation_id and user_id = p_user_id;
  return true;
end;
$$;

create or replace function public.finish_builder_job(
  p_job_id uuid,
  p_user_id uuid,
  p_status text,
  p_reply text,
  p_result jsonb,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_history_message_id uuid;
  v_conversation_id uuid;
  v_workspace_id uuid;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'builder_job_invalid_terminal_status';
  end if;
  if char_length(trim(coalesce(p_reply, ''))) < 1 then
    raise exception 'builder_job_reply_required';
  end if;

  update public.builder_jobs
  set status = p_status,
      result = coalesce(p_result, '{}'::jsonb),
      error = nullif(p_error, ''),
      finished_at = now(),
      updated_at = now()
  where id = p_job_id
    and user_id = p_user_id
    and status = 'running'
    and claim_generation = 0
  returning history_message_id, conversation_id, workspace_id
  into v_history_message_id, v_conversation_id, v_workspace_id;

  if not found then
    return;
  end if;

  update public.assistant_messages
  set content = left(trim(p_reply), 16000),
      provenance = jsonb_build_object(
        'schema', 'signalboost-builder-job-v1',
        'jobId', p_job_id,
        'workspaceId', v_workspace_id,
        'status', p_status,
        'error', nullif(p_error, '')
      )
  where id = v_history_message_id
    and user_id = p_user_id;

  update public.assistant_conversations
  set updated_at = now()
  where id = v_conversation_id
    and user_id = p_user_id;
end;
$$;

create or replace function public.finish_builder_job_slice(
  p_job_id uuid,
  p_user_id uuid,
  p_generation integer,
  p_status text,
  p_reply text,
  p_result jsonb,
  p_error text default null
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_history_message_id uuid;
  v_conversation_id uuid;
  v_workspace_id uuid;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'builder_job_invalid_terminal_status';
  end if;
  if char_length(trim(coalesce(p_reply, ''))) < 1 then
    raise exception 'builder_job_reply_required';
  end if;

  update public.builder_jobs
  set status = p_status,
      checkpoint = null,
      result = coalesce(p_result, '{}'::jsonb),
      error = nullif(p_error, ''),
      finished_at = now(),
      updated_at = now()
  where id = p_job_id
    and user_id = p_user_id
    and status = 'running'
    and claim_generation = p_generation
  returning history_message_id, conversation_id, workspace_id
  into v_history_message_id, v_conversation_id, v_workspace_id;

  if not found then
    return;
  end if;

  update public.assistant_messages
  set content = left(trim(p_reply), 16000),
      provenance = jsonb_build_object(
        'schema', 'signalboost-builder-job-v1',
        'jobId', p_job_id,
        'workspaceId', v_workspace_id,
        'status', p_status,
        'error', nullif(p_error, '')
      )
  where id = v_history_message_id
    and user_id = p_user_id;

  update public.assistant_conversations
  set updated_at = now()
  where id = v_conversation_id
    and user_id = p_user_id;
end;
$$;


revoke all on function public.claim_builder_job_slice(uuid, uuid) from public, anon, authenticated;
revoke all on function public.pause_builder_job_slice(uuid, uuid, integer, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function public.finish_builder_job_slice(uuid, uuid, integer, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_builder_job_slice(uuid, uuid) to service_role;
grant execute on function public.pause_builder_job_slice(uuid, uuid, integer, jsonb, text, jsonb) to service_role;
grant execute on function public.finish_builder_job_slice(uuid, uuid, integer, text, text, jsonb, text) to service_role;

-- Terminalize Builder jobs whose background invocation never reached a result.
-- The function is service-role only and updates the durable History row in the same transaction.
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
      and status in ('queued', 'running')
      and updated_at <= p_cutoff
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
      and status in ('queued', 'running');

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
  'Service-role-only Builder execution-lease reconciliation. Converts stale queued/running jobs and their linked History row to a terminal failure without replaying POST.';

revoke all on function public.expire_stale_builder_jobs(uuid, timestamptz, uuid, uuid) from public, anon, authenticated;
grant execute on function public.expire_stale_builder_jobs(uuid, timestamptz, uuid, uuid) to service_role;
