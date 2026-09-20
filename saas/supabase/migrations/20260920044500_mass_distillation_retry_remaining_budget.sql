-- saas/supabase/migrations/20260920044500_mass_distillation_retry_remaining_budget.sql
-- Make the documented second training attempt reachable without increasing campaign authority.
--
-- A campaign authorizes at most $1.825. The normal first-pass ceilings remain exactly:
-- teacher $0.200 + preparation $0.015 + training $1.610 = $1.825.
-- After a paid training failure, settlement releases unused reserve but retains observed spend.
-- Requiring another full $1.610 reservation therefore made the documented second attempt impossible.
--
-- This migration DOES NOT raise max_total_cost_usd. Only a training retry with an already accepted
-- training provider job may reserve min($1.610, remaining campaign authority). Recovery requires
-- that the remaining authority can fund at least 900 seconds at the most recent accepted training
-- job's recorded hourly rate. If the current provider rate later makes that reserve too small, the
-- consumer fails closed with mass_distillation_stage_budget_too_small_for_hardware and recovery
-- terminalizes the campaign rather than looping.

create or replace function public.claim_cos_university_mass_distillation_stage(p_campaign_id uuid)
returns table (
  run_id uuid,
  campaign_id uuid,
  batch_key text,
  candidate_id text,
  subject_id text,
  student_model_id text,
  stage text,
  stage_cost_ceiling_usd numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.cos_university_mass_distillation_campaigns%rowtype;
  v_run public.cos_university_mass_distillation_batch_runs%rowtype;
  v_cost numeric(10,6);
  v_stage_max numeric(10,6);
  v_remaining numeric(10,6);
  v_training_attempts integer := 0;
  v_next_stage text;
  v_now timestamptz := clock_timestamp();
begin
  select c.* into v_campaign
  from public.cos_university_mass_distillation_campaigns c
  where c.id=p_campaign_id
  for update;
  if not found then raise exception 'mass_distillation_campaign_missing'; end if;
  if v_campaign.status not in ('authorized','active')
    or v_campaign.authorized_at is null or v_campaign.authorized_at > v_now
    or v_campaign.expires_at is null or v_campaign.expires_at <= v_now
    or v_campaign.automatic_promotion_authorized <> false
    or v_campaign.runpod_mutation_authorized <> false then
    return;
  end if;

  select r.* into v_run
  from public.cos_university_mass_distillation_batch_runs r
  where r.campaign_id=p_campaign_id
    and r.stage in ('teacher_pending','preparation_pending','training_pending')
    and r.drill_id is null
    and exists (
      select 1
      from public.cos_university_distillation_curriculum_batches b
      where b.batch_key=r.batch_key and b.status='prepared'
    )
    and not exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=r.id and j.settled_at is null
    )
  order by r.batch_key asc
  for update of r skip locked
  limit 1;
  if not found then return; end if;

  if v_run.stage='teacher_pending' then
    v_stage_max:=0.200000; v_cost:=v_stage_max; v_next_stage:='teacher_dispatching';
  elsif v_run.stage='preparation_pending' then
    v_stage_max:=0.015000; v_cost:=v_stage_max; v_next_stage:='preparation_dispatching';
  else
    v_stage_max:=1.610000; v_next_stage:='training_dispatching';
    select count(*)::integer into v_training_attempts
    from public.cos_university_mass_distillation_provider_jobs j
    where j.run_id=v_run.id and j.operation='training';
    v_remaining:=greatest(0,round(v_campaign.max_total_cost_usd-v_campaign.committed_cost_usd,6));
    v_cost:=case when v_training_attempts > 0 then least(v_stage_max,v_remaining) else v_stage_max end;
  end if;

  if v_cost <= 0
    or round(v_campaign.committed_cost_usd+v_cost,6) > round(v_campaign.max_total_cost_usd,6) then
    raise exception 'mass_distillation_campaign_budget_exhausted';
  end if;

  update public.cos_university_mass_distillation_campaigns c
  set committed_cost_usd=round(c.committed_cost_usd+v_cost,6), status='active', updated_at=v_now
  where c.id=v_campaign.id;
  update public.cos_university_mass_distillation_batch_runs r
  set stage=v_next_stage, stage_reserved_cost_usd=v_cost, failure_reason=null,
      claimed_at=v_now, updated_at=v_now
  where r.id=v_run.id;

  return query select v_run.id, v_run.campaign_id, v_run.batch_key, v_run.candidate_id,
    v_run.subject_id, v_run.student_model_id, v_next_stage, v_cost;
end;
$$;

create or replace function public.rearm_cos_university_mass_distillation_campaign(p_campaign_id uuid, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.cos_university_mass_distillation_campaigns%rowtype;
  v_run public.cos_university_mass_distillation_batch_runs%rowtype;
  v_operation text;
  v_pending_stage text;
  v_accepted_attempts integer;
  v_stage_cost numeric(10,6);
  v_release numeric(10,6);
  v_remaining_authority numeric(10,6) := 0;
  v_retry_hourly_cost numeric(10,6);
  v_minimum_retry_cost numeric(10,6);
  v_rearmed integer := 0;
  v_released numeric(10,6) := 0;
  v_budget_blocked integer := 0;
  v_retry_exhausted integer := 0;
  v_awaiting_provider_discovery integer := 0;
  v_awaiting_provider_settlement integer := 0;
  v_nonterminal_runs integer := 0;
  v_campaign_terminalized boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  select c.* into v_campaign
  from public.cos_university_mass_distillation_campaigns c
  where c.id=p_campaign_id
  for update;
  if not found then raise exception 'mass_distillation_recovery_campaign_missing'; end if;
  if v_campaign.authorized_at is null or v_campaign.authorized_at > v_now
    or v_campaign.expires_at is null or v_campaign.expires_at <= v_now
    or v_campaign.max_total_cost_usd <= 0
    or v_campaign.automatic_promotion_authorized <> false
    or v_campaign.runpod_mutation_authorized <> false then
    raise exception 'mass_distillation_recovery_authorization_invalid';
  end if;
  if length(btrim(coalesce(p_source,''))) < 8 then
    raise exception 'mass_distillation_recovery_source_missing';
  end if;

  if v_campaign.completed_at is not null then
    return jsonb_build_object(
      'campaignId',p_campaign_id,'rearmedRuns',0,'releasedRejectedReserveUsd',0,
      'budgetBlockedRuns',0,'retryExhaustedRuns',0,'campaignTerminalized',false,
      'reason','campaign_already_terminal','maxAcceptedAttemptsPerStage',2,
      'awaitingProviderDiscoveryRuns',0,'awaitingProviderSettlementRuns',0,
      'maxTotalCostUsd',v_campaign.max_total_cost_usd,'automaticRetryAuthorized',false,
      'retryScope',null,'automaticPromotionAuthorized',false,
      'runpodMutationAuthorized',false,'authorityExpanded',false
    );
  end if;

  for v_run in
    select r.* from public.cos_university_mass_distillation_batch_runs r
    where r.campaign_id=p_campaign_id and r.stage='failed'
      and exists (
        select 1 from public.cos_university_distillation_curriculum_batches b
        where b.batch_key=r.batch_key and b.status='prepared'
      )
    order by r.updated_at asc, r.batch_key asc
    for update
  loop
    v_retry_hourly_cost:=null;
    v_minimum_retry_cost:=null;

    if round(coalesce(v_run.stage_reserved_cost_usd,0),6)=1.610000 then
      v_operation:='training'; v_pending_stage:='training_pending'; v_stage_cost:=1.610000;
    elsif round(coalesce(v_run.stage_reserved_cost_usd,0),6)=0.015000 then
      v_operation:='preparation'; v_pending_stage:='preparation_pending'; v_stage_cost:=0.015000;
    elsif round(coalesce(v_run.stage_reserved_cost_usd,0),6)=0.200000 then
      v_operation:='teacher'; v_pending_stage:='teacher_pending'; v_stage_cost:=0.200000;
    elsif v_run.training_job_id is not null then
      v_operation:='training'; v_pending_stage:='training_pending'; v_stage_cost:=1.610000;
    elsif v_run.preparation_job_id is not null then
      v_operation:='preparation'; v_pending_stage:='preparation_pending'; v_stage_cost:=0.015000;
    else
      v_operation:='teacher'; v_pending_stage:='teacher_pending'; v_stage_cost:=0.200000;
    end if;

    if exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=v_run.id and j.operation=v_operation and j.settled_at is null
    ) then
      v_awaiting_provider_settlement:=v_awaiting_provider_settlement+1;
      continue;
    end if;

    select count(*)::integer into v_accepted_attempts
    from public.cos_university_mass_distillation_provider_jobs j
    where j.run_id=v_run.id and j.operation=v_operation;

    if v_accepted_attempts >= 2 then
      v_retry_exhausted:=v_retry_exhausted+1;
      continue;
    end if;

    if coalesce(v_run.failure_reason,'')='mass_distillation_stage_budget_too_small_for_hardware' then
      v_budget_blocked:=v_budget_blocked+1;
      continue;
    end if;

    if coalesce(v_run.failure_reason,'') like 'mass_distillation_provider_submission_uncertain:%'
      and v_run.updated_at > v_now - interval '15 minutes' then
      v_awaiting_provider_discovery:=v_awaiting_provider_discovery+1;
      continue;
    end if;

    if v_run.stage_reserved_cost_usd > 0 and not exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=v_run.id and j.operation=v_operation
        and j.dispatched_at >= coalesce(v_run.claimed_at,v_run.updated_at)-interval '5 seconds'
    ) then
      v_release:=v_run.stage_reserved_cost_usd;
      update public.cos_university_mass_distillation_campaigns c
      set committed_cost_usd=greatest(0,c.committed_cost_usd-v_release),updated_at=v_now
      where c.id=p_campaign_id;
      v_campaign.committed_cost_usd:=greatest(0,v_campaign.committed_cost_usd-v_release);
      v_released:=v_released+v_release;
    end if;

    v_remaining_authority:=greatest(0,round(v_campaign.max_total_cost_usd-v_campaign.committed_cost_usd,6));

    if v_operation='training' and v_accepted_attempts > 0 then
      select j.hourly_cost_usd into v_retry_hourly_cost
      from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=v_run.id and j.operation='training'
      order by j.dispatched_at desc
      limit 1;
      if v_retry_hourly_cost is null or v_retry_hourly_cost <= 0 then
        raise exception 'mass_distillation_recovery_retry_rate_missing';
      end if;
      v_minimum_retry_cost:=round(v_retry_hourly_cost*900/3600,6);
      if v_remaining_authority < v_minimum_retry_cost then
        v_budget_blocked:=v_budget_blocked+1;
        continue;
      end if;
    elsif v_remaining_authority < v_stage_cost then
      v_budget_blocked:=v_budget_blocked+1;
      continue;
    end if;

    update public.cos_university_mass_distillation_batch_runs r
    set stage=v_pending_stage,stage_reserved_cost_usd=0,stage_idempotency_key=null,
        claimed_at=null,failure_reason=null,updated_at=v_now
    where r.id=v_run.id;
    v_rearmed:=v_rearmed+1;
  end loop;

  if v_rearmed > 0 then
    update public.cos_university_mass_distillation_campaigns c
    set status='active',updated_at=v_now
    where c.id=p_campaign_id;
  elsif (v_retry_exhausted > 0 or v_budget_blocked > 0)
    and v_awaiting_provider_discovery=0
    and v_awaiting_provider_settlement=0
    and not exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.campaign_id=p_campaign_id and j.settled_at is null
    ) then
    select count(*)::integer into v_nonterminal_runs
    from public.cos_university_mass_distillation_batch_runs r
    where r.campaign_id=p_campaign_id and r.stage not in ('complete','failed');

    if v_nonterminal_runs=0 then
      update public.cos_university_mass_distillation_campaigns c
      set status='failed',completed_at=v_now,updated_at=v_now
      where c.id=p_campaign_id and c.completed_at is null
        and c.status in ('authorized','active','running','failed');
      v_campaign_terminalized:=found;

      if v_campaign_terminalized then
        insert into public.cos_university_learning_assurance_events (
          event_key,event_type,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at
        ) values (
          encode(extensions.digest(convert_to('mass-distillation-retry-exhausted-terminal:'||p_campaign_id::text,'UTF8'),'sha256'),'hex'),
          'fine_tune','mass_distillation_campaign','mass-campaign:'||p_campaign_id::text,
          encode(extensions.digest(convert_to(p_campaign_id::text||':retry_exhausted:'||v_retry_exhausted::text||':budget_blocked:'||v_budget_blocked::text,'UTF8'),'sha256'),'hex'),
          jsonb_build_object(
            'profile','cos-university-mass-distillation-campaign-v1',
            'claim','mass_distillation_campaign_terminalized','campaignId',p_campaign_id,
            'terminalStatus','failed',
            'reason',case when v_budget_blocked > 0 and v_retry_exhausted = 0
              then 'campaign_budget_exhausted'
              when v_budget_blocked > 0 then 'retry_exhausted_and_budget_exhausted'
              else 'provider_stage_retry_exhausted' end,
            'retryExhaustedRuns',v_retry_exhausted,'budgetBlockedRuns',v_budget_blocked,
            'maxAcceptedAttemptsPerStage',2,'unsettledProviderJobs',0,'nonterminalRuns',0,
            'automaticRetryAuthorized',false,'automaticPromotionAuthorized',false,
            'runpodMutationAuthorized',false,'authorityExpanded',false
          ),
          'host_controller',v_now
        ) on conflict (event_key) do nothing;
      end if;
    end if;
  end if;

  insert into public.cos_university_learning_assurance_events (
    event_key,event_type,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at
  ) values (
    encode(extensions.digest(convert_to('mass-distillation-continuous-recovery:'||p_campaign_id::text||':'||v_now::text,'UTF8'),'sha256'),'hex'),
    'fine_tune','mass_distillation_campaign','mass-campaign:'||p_campaign_id::text,
    encode(extensions.digest(convert_to(p_campaign_id::text||':'||v_rearmed::text||':'||v_released::text||':'||v_budget_blocked::text||':'||v_retry_exhausted::text||':'||btrim(p_source),'UTF8'),'sha256'),'hex'),
    jsonb_build_object(
      'profile','cos-university-mass-distillation-campaign-v1',
      'claim','mass_distillation_campaign_rearmed','campaignId',p_campaign_id,
      'source',left(btrim(p_source),500),'rearmedRuns',v_rearmed,
      'releasedRejectedReserveUsd',round(v_released,6),'budgetBlockedRuns',v_budget_blocked,
      'retryExhaustedRuns',v_retry_exhausted,'campaignTerminalized',v_campaign_terminalized,
      'maxAcceptedAttemptsPerStage',2,'awaitingProviderDiscoveryRuns',v_awaiting_provider_discovery,
      'awaitingProviderSettlementRuns',v_awaiting_provider_settlement,
      'maxTotalCostUsd',v_campaign.max_total_cost_usd,
      'remainingAuthorizedCostUsd',greatest(0,round(v_campaign.max_total_cost_usd-v_campaign.committed_cost_usd,6)),
      'minimumRetryCostUsd',v_minimum_retry_cost,
      'automaticRetryAuthorized',not v_campaign_terminalized,
      'retryScope',case when v_campaign_terminalized then null else 'same_campaign_expiration_remaining_budget_and_two_accepted_attempts_per_stage' end,
      'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
    ),
    'host_controller',v_now
  ) on conflict (event_key) do nothing;

  return jsonb_build_object(
    'campaignId',p_campaign_id,'rearmedRuns',v_rearmed,
    'releasedRejectedReserveUsd',round(v_released,6),'budgetBlockedRuns',v_budget_blocked,
    'retryExhaustedRuns',v_retry_exhausted,'campaignTerminalized',v_campaign_terminalized,
    'maxAcceptedAttemptsPerStage',2,'awaitingProviderDiscoveryRuns',v_awaiting_provider_discovery,
    'awaitingProviderSettlementRuns',v_awaiting_provider_settlement,
    'maxTotalCostUsd',v_campaign.max_total_cost_usd,
    'remainingAuthorizedCostUsd',greatest(0,round(v_campaign.max_total_cost_usd-v_campaign.committed_cost_usd,6)),
    'minimumRetryCostUsd',v_minimum_retry_cost,
    'automaticRetryAuthorized',not v_campaign_terminalized,
    'retryScope',case when v_campaign_terminalized then null else 'same_campaign_expiration_remaining_budget_and_two_accepted_attempts_per_stage' end,
    'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
  );
end;
$$;

revoke all on function public.claim_cos_university_mass_distillation_stage(uuid)
  from public,anon,authenticated;
grant execute on function public.claim_cos_university_mass_distillation_stage(uuid) to service_role;
revoke all on function public.rearm_cos_university_mass_distillation_campaign(uuid,text)
  from public,anon,authenticated;
grant execute on function public.rearm_cos_university_mass_distillation_campaign(uuid,text) to service_role;
