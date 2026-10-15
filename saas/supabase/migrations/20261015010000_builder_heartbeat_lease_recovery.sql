-- Lease-based stale-claim recovery, preserving existing claim-generation fencing.
-- Recover interrupted Builder execution claims without discarding a durable checkpoint.
-- Use a conservative 6-minute lease while live slices are bounded to ~260s.
-- Fenced by row locking and status; future finish attempts from the old claim cannot overwrite recovery.
create or replace function public.requeue_stale_builder_claims(p_cutoff timestamptz)
returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_job record;
  v_count integer := 0;
begin
  if p_cutoff is null or p_cutoff > now() - interval '6 minutes' then
    raise exception 'builder_stale_cutoff_unsafe';
  end if;
  for v_job in
    select id, user_id, workspace_id, history_message_id, claim_generation
    from public.builder_jobs
    where status = 'running' and job_kind = 'standard'
      and checkpoint is not null
      and greatest(updated_at, coalesce(last_heartbeat_at, updated_at)) < p_cutoff
      and claim_generation < 24
    for update skip locked
  loop
    update public.builder_jobs
      set status = 'paused', claim_generation = claim_generation + 1,
          error = null, started_at = null, finished_at = null, updated_at = now(),
          metadata = coalesce(metadata,'{}'::jsonb) ||
            jsonb_build_object('builderStaleRequeues',
              coalesce((metadata->>'builderStaleRequeues')::integer,0) + 1,
              'builderLastStallCode','builder_verification_lease_expired',
              'builderLastStallAt',now())
    where id = v_job.id and user_id = v_job.user_id
      and status = 'running' and claim_generation = v_job.claim_generation
      and coalesce((metadata->>'builderStaleRequeues')::integer,0) < 3;
    if not found then continue; end if;
    update public.assistant_messages set
      content = 'Verification stalled — continuing automatically from saved files.',
      provenance = jsonb_build_object('schema','signalboost-builder-job-v1',
        'jobId',v_job.id,'workspaceId',v_job.workspace_id,'status','paused')
    where id = v_job.history_message_id and user_id = v_job.user_id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.requeue_stale_builder_claims(timestamptz) from public,anon,authenticated;
grant execute on function public.requeue_stale_builder_claims(timestamptz) to service_role;
