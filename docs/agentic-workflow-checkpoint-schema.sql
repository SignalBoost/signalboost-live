-- Deployment proposal: review and create a migration with the Supabase CLI before applying.
-- Server-side only; no grants to anon/authenticated.
create table if not exists public.agentic_workflow_checkpoint (
  run_id text primary key,
  revision bigint not null check (revision >= 0),
  state jsonb not null check (jsonb_typeof(state) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.agentic_workflow_checkpoint enable row level security;
revoke all on public.agentic_workflow_checkpoint from public, anon, authenticated;
grant select, insert, update on public.agentic_workflow_checkpoint to service_role;

create or replace function public.agentic_workflow_checkpoint_cas(
  p_run_id text,
  p_expected_revision bigint,
  p_next_revision bigint,
  p_state jsonb
) returns boolean language plpgsql security invoker
set search_path = '' as $$
begin
  if p_run_id is null or p_run_id !~ '^[a-zA-Z0-9_-]{6,128}$'
    or p_next_revision is null or p_next_revision < 0
    or p_state is null or jsonb_typeof(p_state) <> 'object'
    or (p_expected_revision is null and p_next_revision <> 0)
    or (p_expected_revision is not null and
        (p_expected_revision < 0 or p_next_revision <> p_expected_revision + 1))
  then
    raise exception 'invalid_checkpoint_cas_request';
  end if;
  if p_expected_revision is null then
    insert into public.agentic_workflow_checkpoint(run_id,revision,state)
    values (p_run_id,p_next_revision,p_state)
    on conflict (run_id) do nothing;
  else
    update public.agentic_workflow_checkpoint
      set revision=p_next_revision,state=p_state,updated_at=now()
      where run_id=p_run_id and revision=p_expected_revision;
  end if;
  return found;
end;
$$;
revoke all on function public.agentic_workflow_checkpoint_cas(text,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.agentic_workflow_checkpoint_cas(text,bigint,bigint,jsonb) to service_role;
