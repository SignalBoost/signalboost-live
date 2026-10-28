-- saas/supabase/migrations/20261028130000_builder_repository_repair_v2_continuation.sql
--
-- Repository repairs (platformRepair jobs) now run on Builder V2 and continue across work slices like every other
-- Builder job. Production 2026-10-21..28: the lane could not pause, so a repair that spent its slice's time or provider
-- budget failed outright (70 builder_turn_timeout, 39 harness_provider_cost_budget_exceeded).
--
-- Only a checkpoint that carries the repository repair state is admitted for a platformRepair job. A platformRepair
-- job paused for a pull request awaiting merge keeps checkpoint = null, so neither function touches it.

create or replace function public.pause_builder_job_slice(
  p_job_id uuid, p_user_id uuid, p_generation integer, p_checkpoint jsonb, p_reply text, p_result jsonb
) returns boolean language plpgsql set search_path to 'public', 'pg_temp' as $function$
declare v_job public.builder_jobs;
begin
  if p_checkpoint is null or p_checkpoint->>'version' not in ('1', '2') then
    raise exception 'builder_checkpoint_invalid';
  end if;
  update public.builder_jobs
  set status = 'paused', checkpoint = p_checkpoint, result = p_result, updated_at = now()
  where id = p_job_id and user_id = p_user_id and status = 'running'
    and claim_generation = p_generation and claim_generation < 24
    and job_kind = 'standard'
    and p_checkpoint->>'workspaceId' = workspace_id::text
    and (
      (coalesce((metadata->>'platformRepair')::boolean, false) = false and (
        (p_checkpoint->>'version' = '1' and coalesce(metadata->>'builderEngine','v1') <> 'v2')
        or (p_checkpoint->>'version' = '2' and metadata->>'builderEngine' = 'v2')
      ))
      or (coalesce((metadata->>'platformRepair')::boolean, false) = true
        and p_checkpoint->>'version' = '2'
        and jsonb_typeof(p_checkpoint->'repositoryRepair') = 'object')
    )
  returning * into v_job;
  if not found then return false; end if;
  update public.assistant_messages
  set content = left(p_reply, 16000), provenance = jsonb_build_object(
    'schema', 'signalboost-builder-job-v1', 'jobId', p_job_id,
    'workspaceId', v_job.workspace_id, 'status', 'paused'
  ) where id = v_job.history_message_id and user_id = p_user_id;
  update public.assistant_conversations set updated_at = now()
  where id = v_job.conversation_id and user_id = p_user_id;
  return true;
end;
$function$;

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
              and metadata->>'builderCapacityDeferredReason' in ('builder_runpod_primary_busy', 'builder_model_round_timeout', 'builder_turn_timeout'))
            or (owner_authorized = true and (
              coalesce((metadata->>'selfHealingUniversityDistillation')::boolean, false)
              or coalesce((metadata->>'selfHealingOwnedSite')::boolean, false)
              or coalesce((metadata->>'selfHealingOwnedAudit')::boolean, false)
              or coalesce((metadata->>'selfHealingProductionRecovery')::boolean, false)
            ))
          )
        )
      ))
      or (status = 'paused' and claim_generation < 24 and checkpoint is not null
          and job_kind = 'standard' and (
            coalesce((metadata->>'platformRepair')::boolean, false) = false
            or jsonb_typeof(checkpoint->'repositoryRepair') = 'object'
          ))
    )
    returning *;
$$;
revoke all on function public.claim_builder_job_slice(uuid,uuid) from public, anon, authenticated;
grant execute on function public.claim_builder_job_slice(uuid,uuid) to service_role;
