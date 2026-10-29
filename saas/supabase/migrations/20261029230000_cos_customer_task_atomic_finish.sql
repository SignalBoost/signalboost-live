-- Atomically terminalize the existing canonical COS task and its History receipt.
-- A partial History-only completion must not be observable.
create or replace function public.finish_cos_customer_task(
  p_task_id uuid,
  p_history_message_id uuid,
  p_user_id uuid,
  p_status text,
  p_reply text,
  p_provenance jsonb,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_task_id uuid;
  v_message_id uuid;
begin
  if p_task_id is null or p_history_message_id is null or p_user_id is null
    or p_status not in ('succeeded', 'failed')
    or nullif(btrim(coalesce(p_reply, '')), '') is null
    or jsonb_typeof(p_provenance) is distinct from 'object'
    or p_provenance->>'schema' is distinct from 'signalboost-cos-turn-v1'
    or p_provenance->>'turnId' is distinct from p_task_id::text
    or p_provenance->>'status' is distinct from p_status then
    raise exception 'cos_task_finish_invalid_input' using errcode = '22023';
  end if;

  -- Lock the authoritative task first. Any failure below rolls the entire RPC back.
  select id into v_task_id from public.builder_jobs
  where id = p_task_id and user_id = p_user_id
    and history_message_id = p_history_message_id
    and job_kind = 'cos_turn' and status = 'running'
  for update;
  if v_task_id is null then
    raise exception 'cos_task_finish_not_committed' using errcode = '23514';
  end if;

  update public.assistant_messages
    set content = left(btrim(p_reply), 16000), provenance = p_provenance
  where id = p_history_message_id and user_id = p_user_id
    and role = 'assistant'
    and provenance->>'schema' = 'signalboost-cos-turn-v1'
    and provenance->>'turnId' = p_task_id::text
    and provenance->>'status' = 'running'
  returning id into v_message_id;
  if v_message_id is null then
    raise exception 'cos_turn_finish_not_committed' using errcode = '23514';
  end if;

  update public.builder_jobs
  set status = p_status, finished_at = now(), updated_at = now(),
      error = case when p_status = 'failed'
        then coalesce(nullif(p_error, ''), 'cos_turn_failed') else null end
  where id = v_task_id and status = 'running';

  return true;
end;
$$;

revoke all on function public.finish_cos_customer_task(uuid, uuid, uuid, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.finish_cos_customer_task(uuid, uuid, uuid, text, text, jsonb, text)
  to service_role;
