-- saas/supabase/migrations/20261014020000_builder_capacity_deferral_keeps_progress.sql
-- A re-queued Builder job keeps the progress of the slice that hit model capacity, never an older one.
-- Production 2026-10-13: the capacity re-queue left the job's previous checkpoint in place. Builder wrote files after
-- that checkpoint, so the resumed job failed with builder_checkpoint_workspace_changed. The deferral now stores the
-- checkpoint the runner hands it, or clears the checkpoint when the slice saved none, so a resume starts from the
-- current workspace. Same rules, bounds and grants as 20261013231500 otherwise; its claim function is repeated unchanged. Safe to apply before or after the code:
-- the old four-argument call resolves to this function through the defaulted fifth argument.
begin;
drop function if exists public.defer_builder_job_capacity(uuid, uuid, integer, text);
create or replace function public.defer_builder_job_capacity(
  p_job_id uuid, p_user_id uuid, p_generation integer, p_reason text, p_checkpoint jsonb default null
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
  if p_checkpoint is not null and p_checkpoint->>'version' is distinct from '1' then
    raise exception 'builder_checkpoint_invalid';
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
      checkpoint = p_checkpoint,
      metadata = coalesce(metadata, '{}'::jsonb) || v_metadata, updated_at = now()
    where id = p_job_id and user_id = p_user_id and status = 'running'
      and claim_generation = p_generation;
  return found;
end;
$$;
revoke all on function public.defer_builder_job_capacity(uuid,uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.defer_builder_job_capacity(uuid,uuid,integer,text,jsonb) to service_role;

-- Unchanged from 20261013231500; repeated so this file alone brings any database to the current Builder contract.
-- Allow a deferred standard job to re-claim its original job ID without exceeding the normal
-- four-slice cap for non-capacity continuations. The deferral RPC bounds standard retries.
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
      or (status = 'paused' and claim_generation < 4 and checkpoint is not null
          and job_kind = 'standard' and coalesce((metadata->>'platformRepair')::boolean, false) = false)
    )
    returning *;
$$;
revoke all on function public.claim_builder_job_slice(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_builder_job_slice(uuid,uuid) to service_role;
commit;
