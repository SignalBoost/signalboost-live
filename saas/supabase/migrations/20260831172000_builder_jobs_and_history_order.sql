-- Durable asynchronous Builder jobs and deterministic Assistant History ordering.
-- All Builder job storage remains service-role only; browser access stays behind authenticated API routes.

create sequence if not exists public.assistant_messages_message_order_seq;

alter table public.assistant_messages
  add column if not exists message_order bigint;

alter table public.assistant_messages
  alter column message_order set default nextval('public.assistant_messages_message_order_seq'::regclass);

-- Existing user/assistant pairs can share one timestamp. Backfill deterministically, with the user
-- record before the assistant record, rather than relying on physical UPDATE order or UUID ordering.
with existing_max as (
  select coalesce(max(message_order), 0) as value
  from public.assistant_messages
), ordered_missing as (
  select
    id,
    row_number() over (
      order by
        created_at asc,
        case role when 'user' then 0 when 'assistant' then 1 else 2 end asc,
        id asc
    ) as ordinal
  from public.assistant_messages
  where message_order is null
)
update public.assistant_messages as messages
set message_order = existing_max.value + ordered_missing.ordinal
from existing_max, ordered_missing
where messages.id = ordered_missing.id;

select setval(
  'public.assistant_messages_message_order_seq'::regclass,
  greatest((select coalesce(max(message_order), 0) from public.assistant_messages), 1),
  true
);

alter sequence public.assistant_messages_message_order_seq
  owned by public.assistant_messages.message_order;

alter table public.assistant_messages
  alter column message_order set not null;

create unique index if not exists assistant_messages_message_order_key
  on public.assistant_messages (message_order);

create index if not exists assistant_messages_conversation_order_idx
  on public.assistant_messages (conversation_id, message_order);

create table if not exists public.builder_jobs (
  id uuid primary key,
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  objective text not null,
  job_kind text not null default 'standard',
  metadata jsonb not null default '{}'::jsonb,
  owner_authorized boolean not null default false,
  status text not null default 'queued',
  result jsonb,
  error text,
  history_message_id uuid references public.assistant_messages(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint builder_jobs_workspace_user_fkey
    foreign key (workspace_id, user_id)
    references public.builder_workspaces (id, user_id)
    on delete cascade,
  constraint builder_jobs_status_check
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  constraint builder_jobs_kind_check
    check (job_kind in ('standard', 'debug_file')),
  constraint builder_jobs_objective_size_check
    check (char_length(objective) between 1 and 8000),
  constraint builder_jobs_metadata_object_check
    check (jsonb_typeof(metadata) = 'object')
);

create index if not exists builder_jobs_user_created_idx
  on public.builder_jobs (user_id, created_at desc);

create index if not exists builder_jobs_status_updated_idx
  on public.builder_jobs (status, updated_at);

alter table public.builder_jobs enable row level security;
revoke all on public.builder_jobs from anon, authenticated;

comment on table public.builder_jobs is
  'Service-role-only durable COS Builder job state. Browser access is authenticated and user-filtered through /api/builder.';

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
begin
  if p_job_id is null or p_workspace_id is null or p_user_id is null or p_conversation_id is null then
    raise exception 'builder_job_invalid_identity';
  end if;
  if char_length(trim(coalesce(p_objective, ''))) < 1 or char_length(p_objective) > 8000 then
    raise exception 'builder_job_invalid_objective';
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
    values (p_conversation_id, p_user_id, left(trim(p_objective), 80), 0);
  end if;

  insert into public.assistant_messages (conversation_id, user_id, role, content)
  values (p_conversation_id, p_user_id, 'user', trim(p_objective));

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
    trim(p_objective),
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

create or replace function public.claim_builder_job(
  p_job_id uuid,
  p_user_id uuid
)
returns setof public.builder_jobs
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.builder_jobs
  set status = 'running',
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_job_id
    and user_id = p_user_id
    and status = 'queued'
  returning *;
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

revoke all on function public.enqueue_builder_job(uuid, uuid, uuid, uuid, text, text, jsonb, boolean, text) from public, anon, authenticated;
revoke all on function public.claim_builder_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.finish_builder_job(uuid, uuid, text, text, jsonb, text) from public, anon, authenticated;

grant execute on function public.enqueue_builder_job(uuid, uuid, uuid, uuid, text, text, jsonb, boolean, text) to service_role;
grant execute on function public.claim_builder_job(uuid, uuid) to service_role;
grant execute on function public.finish_builder_job(uuid, uuid, text, text, jsonb, text) to service_role;
