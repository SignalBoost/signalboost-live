-- Align the durable Builder objective contract with the routing boundary.
-- Requests up to 64,000 characters are accepted; missing/oversized objectives receive distinct codes.

alter table public.builder_jobs
  drop constraint if exists builder_jobs_objective_size_check;

alter table public.builder_jobs
  add constraint builder_jobs_objective_size_check
  check (char_length(objective) between 1 and 64000);

create or replace function public.enqueue_builder_job(
  p_job_id uuid,
  p_workspace_id uuid,
  p_user_id uuid,
  p_conversation_id uuid,
  p_objective text,
  p_job_kind text,
  p_metadata jsonb,
  p_owner_authorized boolean,
  p_running_reply text
)
returns table(job_id uuid, history_message_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_conversation_user uuid;
  v_history_message_id uuid;
  v_objective text := trim(coalesce(p_objective, ''));
begin
  if p_job_id is null or p_workspace_id is null or p_user_id is null or p_conversation_id is null then
    raise exception 'builder_job_invalid_identity';
  end if;
  if char_length(v_objective) < 1 then
    raise exception 'builder_job_objective_required';
  end if;
  if char_length(v_objective) > 64000 then
    raise exception 'builder_job_objective_too_large';
  end if;
  if p_job_kind not in ('standard', 'debug_file') then
    raise exception 'builder_job_invalid_kind';
  end if;
  if jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'builder_job_invalid_metadata';
  end if;

  select user_id into v_conversation_user
  from public.assistant_conversations
  where id = p_conversation_id;

  if found and v_conversation_user <> p_user_id then
    raise exception 'builder_job_conversation_ownership_mismatch';
  end if;

  if not found then
    insert into public.assistant_conversations (id, user_id, title, message_count)
    values (p_conversation_id, p_user_id, left(v_objective, 80), 0);
  end if;

  insert into public.assistant_messages (conversation_id, user_id, role, content)
  values (p_conversation_id, p_user_id, 'user', v_objective);

  insert into public.assistant_messages (conversation_id, user_id, role, content, provenance)
  values (
    p_conversation_id,
    p_user_id,
    'assistant',
    left(trim(p_running_reply), 4000),
    jsonb_build_object(
      'schema', 'signalboost-builder-job-v1',
      'jobId', p_job_id,
      'workspaceId', p_workspace_id,
      'status', 'running'
    )
  )
  returning id into v_history_message_id;

  insert into public.builder_jobs (
    id,
    workspace_id,
    user_id,
    conversation_id,
    objective,
    job_kind,
    metadata,
    owner_authorized,
    status,
    history_message_id
  ) values (
    p_job_id,
    p_workspace_id,
    p_user_id,
    p_conversation_id,
    v_objective,
    p_job_kind,
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_owner_authorized, false),
    'queued',
    v_history_message_id
  );

  update public.assistant_conversations
  set message_count = message_count + 2,
      updated_at = now()
  where id = p_conversation_id and user_id = p_user_id;

  return query select p_job_id, v_history_message_id;
end;
$$;

revoke all on function public.enqueue_builder_job(uuid, uuid, uuid, uuid, text, text, jsonb, boolean, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_builder_job(uuid, uuid, uuid, uuid, text, text, jsonb, boolean, text)
  to service_role;
