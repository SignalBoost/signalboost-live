-- saas/supabase/migrations/20261014060000_builder_progress_work_slices.sql
-- Builder jobs may continue past their first 4 work slices, up to 12, while each slice makes progress.
-- Production 2026-10-14: the OrderFlow build (15 required files, 30+ tests) stopped after 4 slices with 9 files written
-- and 29/31 tests passing. The job runner (builderMayContinue) decides whether a slice earned another one; these
-- functions only enforce the ceiling (MAX_WORK_SLICES = 12 in saas/lib/builder/job-store.ts).
-- Written for the Hub "Run Migration" path (hub_exec_sql): no BEGIN/COMMIT, which that path cannot execute.
-- Also restates the current four-argument defer_builder_job_capacity (20261013231500) so Production is in a known state.
-- Safe to run more than once.

create or replace function public.defer_builder_job_capacity(
  p_job_id uuid, p_user_id uuid, p_generation integer, p_reason text
)
returns boolean
language plpgsql security invoker set search_path = public, pg_temp
as $$
declare
  v_job public.builder_jobs;
  v_deferrals integer;
  v_timeout_deferrals integer;
  v_metadata jsonb;
  v_self_healing boolean;
begin
  if p_reason not in ('builder_runpod_primary_busy', 'builder_turn_timeout', 'builder_model_round_timeout') then
    raise exception 'builder_capacity_deferral_reason_not_allowed';
  end if;
  select * into v_job from public.builder_jobs
    where id = p_job_id and user_id = p_user_id and status = 'running'
      and claim_generation = p_generation and job_kind = 'standard' for update;
  if not found then return false; end if;
  v_self_healing := v_job.owner_authorized and (
    coalesce((v_job.metadata->>'selfHealingUniversityDistillation')::boolean, false)
    or coalesce((v_job.metadata->>'selfHealingOwnedSite')::boolean, false)
    or coalesce((v_job.metadata->>'selfHealingOwnedAudit')::boolean, false)
    or coalesce((v_job.metadata->>'selfHealingProductionRecovery')::boolean, false)
  );
  if not v_self_healing and p_reason not in ('builder_runpod_primary_busy', 'builder_model_round_timeout') then return false; end if;
  v_deferrals := case when coalesce(v_job.metadata->>'builderCapacityDeferrals', '') ~ '^[0-9]+$'
    then (v_job.metadata->>'builderCapacityDeferrals')::integer else 0 end;
  if not v_self_healing and v_deferrals >= 3 then return false; end if;
  v_deferrals := v_deferrals + 1;
  v_timeout_deferrals := case when coalesce(v_job.metadata->>'builderExecutionTimeoutDeferrals', '') ~ '^[0-9]+$'
    then (v_job.metadata->>'builderExecutionTimeoutDeferrals')::integer else 0 end;
  if p_reason in ('builder_turn_timeout', 'builder_model_round_timeout') then
    if v_timeout_deferrals >= 3 then return false; end if;
    v_timeout_deferrals := v_timeout_deferrals + 1;
  end if;
  v_metadata := jsonb_build_object(
    'builderCapacityDeferrals', v_deferrals, 'builderCapacityDeferredAt', now(),
    'builderCapacityDeferredReason', p_reason
  );
  if p_reason in ('builder_turn_timeout', 'builder_model_round_timeout') then
    v_metadata := v_metadata || jsonb_build_object('builderExecutionTimeoutDeferrals', v_timeout_deferrals);
  end if;
  update public.builder_jobs
    set status = 'queued', error = null, started_at = null, finished_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || v_metadata, updated_at = now()
    where id = p_job_id and user_id = p_user_id and status = 'running'
      and claim_generation = p_generation;
  return found;
end;
$$;
revoke all on function public.defer_builder_job_capacity(uuid,uuid,integer,text) from public, anon, authenticated;
grant execute on function public.defer_builder_job_capacity(uuid,uuid,integer,text) to service_role;

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
    and claim_generation = p_generation and claim_generation < 12
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
revoke all on function public.pause_builder_job_slice(uuid, uuid, integer, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.pause_builder_job_slice(uuid, uuid, integer, jsonb, text, jsonb) to service_role;

create or replace function public.claim_builder_job_slice(p_job_id uuid, p_user_id uuid)
returns setof public.builder_jobs language sql security invoker set search_path = public, pg_temp
as $$
  update public.builder_jobs
    set status = 'running', claim_generation = claim_generation + 1,
      started_at = coalesce(started_at, now()), updated_at = now()
    where id = p_job_id and user_id = p_user_id and (
      (status = 'queued' and (
        claim_generation < 4
        or (
          job_kind = 'standard' and
          (
            (coalesce((metadata->>'builderCapacityDeferrals')::integer, 0) between 1 and 3
              and metadata->>'builderCapacityDeferredReason' in ('builder_runpod_primary_busy', 'builder_model_round_timeout'))
            or (owner_authorized = true and (
              coalesce((metadata->>'selfHealingUniversityDistillation')::boolean, false)
              or coalesce((metadata->>'selfHealingOwnedSite')::boolean, false)
              or coalesce((metadata->>'selfHealingOwnedAudit')::boolean, false)
              or coalesce((metadata->>'selfHealingProductionRecovery')::boolean, false)
            ))
          )
        )
      ))
      or (status = 'paused' and claim_generation < 12 and checkpoint is not null
          and job_kind = 'standard' and coalesce((metadata->>'platformRepair')::boolean, false) = false)
    )
    returning *;
$$;
revoke all on function public.claim_builder_job_slice(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_builder_job_slice(uuid,uuid) to service_role;
