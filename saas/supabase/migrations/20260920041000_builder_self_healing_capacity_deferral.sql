-- Self-Healing Builder capacity contention is a queue condition, not a terminal repair failure.
-- Keep the normal four-slice continuation ceiling, but allow trusted owner-authorized Self-Healing
-- jobs to be reclaimed after a capacity deferral without exhausting claim_generation.

alter table public.builder_jobs
  drop constraint if exists builder_jobs_claim_generation_check;

alter table public.builder_jobs
  add constraint builder_jobs_claim_generation_check
  check (claim_generation >= 0);

create or replace function public.claim_builder_job_slice(p_job_id uuid, p_user_id uuid)
returns setof public.builder_jobs
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.builder_jobs
  set status = 'running',
      claim_generation = claim_generation + 1,
      started_at = coalesce(started_at, now()),
      updated_at = now()
  where id = p_job_id
    and user_id = p_user_id
    and (
      (
        status = 'queued'
        and (
          claim_generation < 4
          or (
            job_kind = 'standard'
            and owner_authorized = true
            and (
              coalesce((metadata->>'selfHealingUniversityDistillation')::boolean, false)
              or coalesce((metadata->>'selfHealingOwnedSite')::boolean, false)
              or coalesce((metadata->>'selfHealingOwnedAudit')::boolean, false)
            )
          )
        )
      )
      or (
        status = 'paused'
        and claim_generation < 4
        and checkpoint is not null
        and job_kind = 'standard'
        and coalesce((metadata->>'platformRepair')::boolean, false) = false
      )
    )
  returning *;
$$;

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
begin
  if p_reason not in ('builder_runpod_primary_busy', 'builder_turn_timeout') then
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

  update public.builder_jobs
  set status = 'queued',
      error = null,
      started_at = null,
      finished_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'builderCapacityDeferrals', v_deferrals,
        'builderCapacityDeferredAt', now(),
        'builderCapacityDeferredReason', p_reason
      ),
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

revoke all on function public.claim_builder_job_slice(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_builder_job_slice(uuid, uuid)
  to service_role;
