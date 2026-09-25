-- Allow exactly one full failure-derived remediation campaign while the ordinary training backlog gate is closed.
-- This is a narrow quality-repair exception: general new training remains paused.
-- Existing campaign/stage spend ceilings, rights checks, no-promotion and no-Production-traffic fences remain unchanged.

create or replace function public.authorize_next_cos_university_mass_distillation_remediation_campaign()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.cos_university_mass_distillation_rolling_policy%rowtype;
  v_now timestamptz := clock_timestamp();
  v_window_authorized numeric(10,6) := 0;
  v_next_cost constant numeric(10,6) := 1.825000;
  v_active_campaigns integer := 0;
  v_active_remediation_campaigns integer := 0;
  v_unsettled_jobs integer := 0;
  v_batch_key text;
  v_campaign_id uuid;
begin
  select p.* into v_policy
  from public.cos_university_mass_distillation_rolling_policy p
  where p.policy_key = 'owner-rolling-24h-v1'
  for update;

  if not found or v_policy.enabled is not true then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','rolling_authorization_disabled',
      'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
    );
  end if;

  select coalesce(sum(c.max_total_cost_usd),0)
  into v_window_authorized
  from public.cos_university_mass_distillation_campaigns c
  where c.authorized_at > v_now - v_policy.rolling_window;

  select count(*) into v_active_campaigns
  from public.cos_university_mass_distillation_campaigns c
  where (c.status in ('authorized','active') or (c.status='failed' and c.completed_at is null))
    and c.expires_at > v_now;

  select count(*) into v_active_remediation_campaigns
  from public.cos_university_mass_distillation_campaigns c
  where (c.status in ('authorized','active') or (c.status='failed' and c.completed_at is null))
    and c.expires_at > v_now
    and exists (
      select 1
      from unnest(c.batch_keys) k(batch_key)
      join public.cos_university_distillation_curriculum_batches b on b.batch_key = k.batch_key
      where (
        select count(distinct cl.content_hash)
        from unnest(b.source_hashes) h(content_hash)
        join public.cos_continuous_learning cl on cl.content_hash = h.content_hash
        where cl.source_kind = 'failure_derived_curriculum'
      ) >= 20
    );

  select count(*) into v_unsettled_jobs
  from public.cos_university_mass_distillation_provider_jobs j
  where j.settled_at is null;

  if v_active_campaigns >= v_policy.max_concurrent_campaigns then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','dynamic_capacity_full',
      'activeCampaigns',v_active_campaigns,
      'maxConcurrentCampaigns',v_policy.max_concurrent_campaigns,
      'capacityRemaining',0,
      'unsettledProviderJobs',v_unsettled_jobs,
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
    );
  end if;

  if v_active_remediation_campaigns >= 1 then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','remediation_campaign_already_active',
      'activeCampaigns',v_active_campaigns,
      'maxConcurrentCampaigns',v_policy.max_concurrent_campaigns,
      'capacityRemaining',greatest(0,v_policy.max_concurrent_campaigns-v_active_campaigns),
      'unsettledProviderJobs',v_unsettled_jobs,
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
    );
  end if;

  if v_policy.max_authorized_cost_usd is not null
     and round(v_window_authorized + v_next_cost,6) > round(v_policy.max_authorized_cost_usd,6) then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','rolling_budget_exhausted',
      'activeCampaigns',v_active_campaigns,
      'maxConcurrentCampaigns',v_policy.max_concurrent_campaigns,
      'capacityRemaining',greatest(0,v_policy.max_concurrent_campaigns-v_active_campaigns),
      'unsettledProviderJobs',v_unsettled_jobs,
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
    );
  end if;

  select b.batch_key into v_batch_key
  from public.cos_university_distillation_curriculum_batches b
  where b.status = 'prepared'
    and b.dispatch_authorized = false
    and b.authority_expanded = false
    and b.student_model_id = 'Qwen/Qwen3-4B'
    and b.source_count between 64 and 128
    and not exists (
      select 1 from public.cos_university_mass_distillation_batch_runs r where r.batch_key = b.batch_key
    )
    and (
      select count(distinct cl.content_hash)
      from unnest(b.source_hashes) h(content_hash)
      join public.cos_continuous_learning cl on cl.content_hash = h.content_hash
      where cl.source_kind = 'failure_derived_curriculum'
    ) >= 20
  order by
    (
      select count(distinct cl.content_hash)
      from unnest(b.source_hashes) h(content_hash)
      join public.cos_continuous_learning cl on cl.content_hash = h.content_hash
      where cl.source_kind = 'failure_derived_curriculum'
    ) desc,
    b.prepared_at asc,
    b.batch_key asc
  for update skip locked
  limit 1;

  if v_batch_key is null then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','no_full_remediation_batch',
      'activeCampaigns',v_active_campaigns,
      'maxConcurrentCampaigns',v_policy.max_concurrent_campaigns,
      'capacityRemaining',greatest(0,v_policy.max_concurrent_campaigns-v_active_campaigns),
      'unsettledProviderJobs',v_unsettled_jobs,
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
    );
  end if;

  v_campaign_id := public.authorize_cos_university_mass_distillation_campaign(
    array[v_batch_key], v_next_cost, v_policy.authorization_ref, v_policy.campaign_valid_for
  );

  update public.cos_university_mass_distillation_rolling_policy p
  set last_campaign_authorized_at = v_now, updated_at = v_now
  where p.policy_key = v_policy.policy_key;

  return jsonb_build_object(
    'ok',true,'authorized',true,'reason','remediation_campaign_authorized',
    'campaignId',v_campaign_id,'batchKey',v_batch_key,'batchCount',1,
    'campaignMaximumAuthorizedCostUsd',v_next_cost,
    'activeCampaigns',v_active_campaigns+1,
    'maxConcurrentCampaigns',v_policy.max_concurrent_campaigns,
    'capacityRemaining',greatest(0,v_policy.max_concurrent_campaigns-v_active_campaigns-1),
    'unsettledProviderJobs',v_unsettled_jobs,
    'rollingWindowHours',24,
    'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
    'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
    'rollingAuthorizedCostUsd',round(v_window_authorized+v_next_cost,6),
    'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized-v_next_cost),6) end,
    'authorizationRef',v_policy.authorization_ref,
    'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
  );
end;
$$;

revoke all on function public.authorize_next_cos_university_mass_distillation_remediation_campaign()
  from public, anon, authenticated;
grant execute on function public.authorize_next_cos_university_mass_distillation_remediation_campaign()
  to service_role;

notify pgrst, 'reload schema';
