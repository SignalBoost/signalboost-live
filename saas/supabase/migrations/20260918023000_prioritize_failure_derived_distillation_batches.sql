-- Prioritize prepared batches that actually contain failure-derived remediation material.
-- All existing owner authorization, campaign concurrency, provider-settlement, per-campaign cost,
-- promotion, Production-traffic and RunPod fences remain unchanged.

create or replace function public.authorize_next_cos_university_mass_distillation_campaign()
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
  v_unsettled_jobs integer := 0;
  v_batch_key text;
  v_campaign_id uuid;
  v_next_budget_release_at timestamptz;
begin
  select p.* into v_policy
  from public.cos_university_mass_distillation_rolling_policy p
  where p.policy_key = 'owner-rolling-24h-v1'
  for update;

  if not found or v_policy.enabled is not true then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','rolling_authorization_disabled','authorityExpanded',false
    );
  end if;

  select coalesce(sum(c.max_total_cost_usd),0), min(c.authorized_at + v_policy.rolling_window)
  into v_window_authorized, v_next_budget_release_at
  from public.cos_university_mass_distillation_campaigns c
  where c.authorized_at > v_now - v_policy.rolling_window;

  select count(*) into v_active_campaigns
  from public.cos_university_mass_distillation_campaigns c
  where (c.status in ('authorized','active') or (c.status='failed' and c.completed_at is null))
    and c.expires_at > v_now;

  select count(*) into v_unsettled_jobs
  from public.cos_university_mass_distillation_provider_jobs j
  where j.settled_at is null;

  if v_active_campaigns >= v_policy.max_concurrent_campaigns or v_unsettled_jobs > 0 then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','campaign_in_progress',
      'activeCampaigns',v_active_campaigns,'unsettledProviderJobs',v_unsettled_jobs,
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
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'nextBudgetReleaseAt',v_next_budget_release_at,
      'automaticPromotionAuthorized',false,'runpodMutationAuthorized',false,'authorityExpanded',false
    );
  end if;

  select b.batch_key into v_batch_key
  from public.cos_university_distillation_curriculum_batches b
  where b.status = 'prepared'
    and b.dispatch_authorized = false
    and b.authority_expanded = false
    and b.student_model_id = 'Qwen/Qwen3-4B'
    and b.source_count between 20 and 128
    and not exists (
      select 1
      from public.cos_university_mass_distillation_batch_runs r
      where r.batch_key = b.batch_key
    )
  order by
    case when exists (
      select 1
      from public.cos_continuous_learning cl
      where cl.source_kind = 'failure_derived_curriculum'
        and cl.content_hash = any(b.source_hashes)
    ) then 0 else 1 end,
    b.prepared_at asc,
    b.batch_key asc
  for update skip locked
  limit v_policy.batches_per_campaign;

  if v_batch_key is null then
    return jsonb_build_object(
      'ok',true,'authorized',false,'reason','no_prepared_batch',
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
    'ok',true,'authorized',true,'reason','campaign_authorized',
    'campaignId',v_campaign_id,'batchKey',v_batch_key,'batchCount',1,
    'campaignMaximumAuthorizedCostUsd',v_next_cost,
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

revoke all on function public.authorize_next_cos_university_mass_distillation_campaign()
  from public, anon, authenticated;
grant execute on function public.authorize_next_cos_university_mass_distillation_campaign()
  to service_role;

notify pgrst, 'reload schema';
