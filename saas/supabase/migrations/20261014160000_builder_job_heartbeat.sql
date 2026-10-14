-- Additive, service-role-only Builder execution observability.
alter table public.builder_jobs
  add column if not exists last_started_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists last_finished_at timestamptz,
  add column if not exists last_error text;

create index if not exists builder_jobs_running_heartbeat_idx
  on public.builder_jobs (last_heartbeat_at)
  where status = 'running';

-- Heartbeats must be fenced to the active claim to prevent a superseded worker
-- from updating a newer execution. Do not update updated_at: stale-job recovery
-- retains its existing independently enforced execution lease.
create or replace function public.heartbeat_builder_job(p_job_id uuid, p_user_id uuid, p_generation integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.builder_jobs set last_heartbeat_at = now()
  where id = p_job_id and user_id = p_user_id
    and status = 'running' and claim_generation = p_generation;
  return found;
end;
$$;
revoke all on function public.heartbeat_builder_job(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.heartbeat_builder_job(uuid,uuid,integer) to service_role;
