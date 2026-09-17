-- Production repair: restore the two accepted-attempt ceiling that was accidentally removed by
-- 20260915223000_cos_university_mass_distillation_continuous_retry.sql. The repair preserves the
-- existing campaign expiration, cost ceiling, promotion, traffic, and RunPod authority boundaries.

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
  v_rearmed integer := 0;
  v_released numeric(10,6) := 0;
  v_budget_blocked integer := 0;
  v_retry_exhausted integer := 0;
  v_awaiting_provider_discovery integer := 0;
  v_awaiting_provider_settlement integer := 0;
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

  for v_run in
    select r.* from public.cos_university_mass_distillation_batch_runs r
    where r.campaign_id=p_campaign_id and r.stage='failed'
      and exists (
        select 1
        from public.cos_university_distillation_curriculum_batches b
        where b.batch_key=r.batch_key and b.status='prepared'
      )
    order by r.updated_at asc, r.batch_key asc
    for update
  loop
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
      v_awaiting_provider_settlement := v_awaiting_provider_settlement + 1;
      continue;
    end if;

    select count(*)::integer into v_accepted_attempts
    from public.cos_university_mass_distillation_provider_jobs j
    where j.run_id=v_run.id and j.operation=v_operation;

    if v_accepted_attempts >= 2 then
      v_retry_exhausted := v_retry_exhausted + 1;
      continue;
    end if;

    if coalesce(v_run.failure_reason,'') like 'mass_distillation_provider_submission_uncertain:%'
      and v_run.updated_at > v_now - interval '15 minutes' then
      v_awaiting_provider_discovery := v_awaiting_provider_discovery + 1;
      continue;
    end if;

    if v_run.stage_reserved_cost_usd > 0 and not exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=v_run.id and j.operation=v_operation
        and j.dispatched_at >= coalesce(v_run.claimed_at,v_run.updated_at) - interval '5 seconds'
    ) then
      v_release := v_run.stage_reserved_cost_usd;
      update public.cos_university_mass_distillation_campaigns c
      set committed_cost_usd=greatest(0,c.committed_cost_usd-v_release), updated_at=v_now
      where c.id=p_campaign_id;
      v_campaign.committed_cost_usd := greatest(0,v_campaign.committed_cost_usd-v_release);
      v_released := v_released + v_release;
    end if;

    if round(v_campaign.committed_cost_usd+v_stage_cost,6) > round(v_campaign.max_total_cost_usd,6) then
      v_budget_blocked := v_budget_blocked + 1;
      continue;
    end if;

    update public.cos_university_mass_distillation_batch_runs r
    set stage=v_pending_stage, stage_reserved_cost_usd=0, stage_idempotency_key=null,
        claimed_at=null, failure_reason=null, updated_at=v_now
    where r.id=v_run.id;
    v_rearmed := v_rearmed + 1;
  end loop;

  if v_rearmed > 0 then
    update public.cos_university_mass_distillation_campaigns c
    set status='active', updated_at=v_now
    where c.id=p_campaign_id;
  end if;

  insert into public.cos_university_learning_assurance_events (
    event_key,event_type,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at
  ) values (
    encode(extensions.digest(convert_to('mass-distillation-continuous-recovery:'||p_campaign_id::text||':'||v_now::text,'UTF8'),'sha256'),'hex'),
    'fine_tune','mass_distillation_campaign','mass-campaign:'||p_campaign_id::text,
    encode(extensions.digest(convert_to(p_campaign_id::text||':'||v_rearmed::text||':'||v_released::text||':'||v_budget_blocked::text||':'||v_retry_exhausted::text||':'||btrim(p_source),'UTF8'),'sha256'),'hex'),
    jsonb_build_object(
      'profile','cos-university-mass-distillation-campaign-v1',
      'claim','mass_distillation_campaign_rearmed',
      'campaignId',p_campaign_id,
      'source',left(btrim(p_source),500),
      'rearmedRuns',v_rearmed,
      'releasedRejectedReserveUsd',round(v_released,6),
      'budgetBlockedRuns',v_budget_blocked,
      'retryExhaustedRuns',v_retry_exhausted,
      'maxAcceptedAttemptsPerStage',2,
      'awaitingProviderDiscoveryRuns',v_awaiting_provider_discovery,
      'awaitingProviderSettlementRuns',v_awaiting_provider_settlement,
      'maxTotalCostUsd',v_campaign.max_total_cost_usd,
      'automaticRetryAuthorized',true,
      'retryScope','same_campaign_expiration_remaining_budget_and_two_accepted_attempts_per_stage',
      'automaticPromotionAuthorized',false,
      'runpodMutationAuthorized',false,
      'authorityExpanded',false
    ),
    'host_controller',v_now
  ) on conflict (event_key) do nothing;

  return jsonb_build_object(
    'campaignId',p_campaign_id,
    'rearmedRuns',v_rearmed,
    'releasedRejectedReserveUsd',round(v_released,6),
    'budgetBlockedRuns',v_budget_blocked,
    'retryExhaustedRuns',v_retry_exhausted,
    'maxAcceptedAttemptsPerStage',2,
    'awaitingProviderDiscoveryRuns',v_awaiting_provider_discovery,
    'awaitingProviderSettlementRuns',v_awaiting_provider_settlement,
    'maxTotalCostUsd',v_campaign.max_total_cost_usd,
    'automaticRetryAuthorized',true,
    'retryScope','same_campaign_expiration_remaining_budget_and_two_accepted_attempts_per_stage',
    'automaticPromotionAuthorized',false,
    'runpodMutationAuthorized',false,
    'authorityExpanded',false
  );
end;
$$;

revoke all on function public.rearm_cos_university_mass_distillation_campaign(uuid,text)
  from public, anon, authenticated;
grant execute on function public.rearm_cos_university_mass_distillation_campaign(uuid,text) to service_role;
