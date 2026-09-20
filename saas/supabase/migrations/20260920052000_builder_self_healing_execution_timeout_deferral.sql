create or replace function public.defer_builder_job_capacity(
  p_job_id uuid,
  p_user_id uuid,
  p_generation integer,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_job public.builder_jobs;
  v_deferrals integer;
  v_timeout_deferrals integer;
  v_metadata jsonb;
begin
  if p_reason not in ('builder_runpod_primary_busy', 'builder_turn_timeout', 'builder_model_round_timeout') then
    raise exception 'builder_capacity_deferral_reason_not_allowed';
  end if;

  select * into v_job
  from public.builder_jobs
  where id = p_job_id
    and user_id = p_user_id
    and status = 'running'
    and claim_generation = p_generation
    and job_kind = 'standard'
    and owner_authorized = true
    and (
      coalesce((metadata->>'selfHealingUniversityDistillation')::boolean, false)
      or coalesce((metadata->>'selfHealingOwnedSite')::boolean, false)
      or coalesce((metadata->>'selfHealingOwnedAudit')::boolean, false)
    )
  for update;

  if not found then return false; end if;

  v_deferrals := case
    when coalesce(v_job.metadata->>'builderCapacityDeferrals', '') ~ '^[0-9]+$'
      then (v_job.metadata->>'builderCapacityDeferrals')::integer + 1
    else 1
  end;

  v_timeout_deferrals := case
    when coalesce(v_job.metadata->>'builderExecutionTimeoutDeferrals', '') ~ '^[0-9]+$'
      then (v_job.metadata->>'builderExecutionTimeoutDeferrals')::integer
    else 0
  end;

  if p_reason in ('builder_turn_timeout', 'builder_model_round_timeout') then
    if v_timeout_deferrals >= 3 then return false; end if;
    v_timeout_deferrals := v_timeout_deferrals + 1;
  end if;

  v_metadata := jsonb_build_object(
    'builderCapacityDeferrals', v_deferrals,
    'builderCapacityDeferredAt', now(),
    'builderCapacityDeferredReason', p_reason
  );
  if p_reason in ('builder_turn_timeout', 'builder_model_round_timeout') then
    v_metadata := v_metadata || jsonb_build_object(
      'builderExecutionTimeoutDeferrals', v_timeout_deferrals
    );
  end if;

  update public.builder_jobs
  set status = 'queued',
      error = null,
      started_at = null,
      finished_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || v_metadata,
      updated_at = now()
  where id = p_job_id
    and user_id = p_user_id
    and status = 'running'
    and claim_generation = p_generation;

  return found;
end;
$$;

revoke all on function public.defer_builder_job_capacity(uuid, uuid, integer, text)
  from public, anon, authenticated;
grant execute on function public.defer_builder_job_capacity(uuid, uuid, integer, text)
  to service_role;
