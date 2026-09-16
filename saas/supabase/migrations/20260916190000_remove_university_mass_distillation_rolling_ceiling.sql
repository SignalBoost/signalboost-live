-- saas/supabase/migrations/20260916190000_remove_university_mass_distillation_rolling_ceiling.sql
-- Owner direction 2026-09-16: remove the $25 rolling 24-hour ceiling on Hugging Face mass distillation.
-- The owner stops spending by withdrawing provider credit, not by a platform ceiling.
--
-- Unchanged on purpose: one campaign at a time, no authorization while provider jobs are unsettled, one prepared
-- batch per campaign, each campaign's own $1.825 hard ceiling and existing per-stage cost fences, no promotion,
-- no RunPod mutation, no Production traffic. Setting max_authorized_cost_usd back to a number restores a ceiling.

do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.cos_university_mass_distillation_rolling_policy'::regclass
      and con.contype = 'c'
      and (pg_get_constraintdef(con.oid) like '%max_authorized_cost_usd%'
        or pg_get_constraintdef(con.oid) like '%authorization_ref%')
  loop
    execute format('alter table public.cos_university_mass_distillation_rolling_policy drop constraint %I', c.conname);
  end loop;
end
$$;

alter table public.cos_university_mass_distillation_rolling_policy
  alter column max_authorized_cost_usd drop not null;

alter table public.cos_university_mass_distillation_rolling_policy
  add constraint cos_umd_rolling_policy_ceiling_check
    check (max_authorized_cost_usd is null or max_authorized_cost_usd >= 1.825000);

alter table public.cos_university_mass_distillation_rolling_policy
  add constraint cos_umd_rolling_policy_authorization_ref_check
    check (authorization_ref in (
      'owner_explicit_approval_2026-09-15_rolling_24h_max_25_usd',
      'owner_explicit_direction_2026-09-16_no_rolling_ceiling'
    ));

update public.cos_university_mass_distillation_rolling_policy
set max_authorized_cost_usd = null,
    authorization_ref = 'owner_explicit_direction_2026-09-16_no_rolling_ceiling',
    authorized_at = clock_timestamp(),
    updated_at = clock_timestamp()
where policy_key = 'owner-rolling-24h-v1';

comment on table public.cos_university_mass_distillation_rolling_policy is
  'Owner Hugging Face mass-distillation continuity policy. A null max_authorized_cost_usd means no rolling 24-hour ceiling (owner direction 2026-09-16). It cannot authorize promotion, Production traffic, RunPod mutation, non-prepared data, or parallel campaigns, and each campaign keeps its own hard ceiling.';

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
  -- This row lock serializes every scheduled worker and offset Supervisor repair before either can
  -- inspect or consume the same rolling budget. The existing campaign RPC then runs in this exact
  -- transaction and preserves all per-batch/provider cost fences.
  select p.* into v_policy
  from public.cos_university_mass_distillation_rolling_policy p
  where p.policy_key = 'owner-rolling-24h-v1'
  for update;

  if not found or v_policy.enabled is not true then
    return jsonb_build_object(
      'ok',true,
      'authorized',false,
      'reason','rolling_authorization_disabled',
      'authorityExpanded',false
    );
  end if;

  select coalesce(sum(c.max_total_cost_usd),0), min(c.authorized_at + v_policy.rolling_window)
  into v_window_authorized, v_next_budget_release_at
  from public.cos_university_mass_distillation_campaigns c
  where c.authorized_at > v_now - v_policy.rolling_window;

  select count(*) into v_active_campaigns
  from public.cos_university_mass_distillation_campaigns c
  where c.status in ('authorized','active','failed')
    and c.expires_at > v_now;

  select count(*) into v_unsettled_jobs
  from public.cos_university_mass_distillation_provider_jobs j
  where j.settled_at is null;

  if v_active_campaigns >= v_policy.max_concurrent_campaigns or v_unsettled_jobs > 0 then
    return jsonb_build_object(
      'ok',true,
      'authorized',false,
      'reason','campaign_in_progress',
      'activeCampaigns',v_active_campaigns,
      'unsettledProviderJobs',v_unsettled_jobs,
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'automaticPromotionAuthorized',false,
      'runpodMutationAuthorized',false,
      'authorityExpanded',false
    );
  end if;

  -- A null ceiling is the owner's standing direction (2026-09-16): no rolling spend ceiling. The one-campaign-at-a-time
  -- fence, the unsettled-provider-job fence and each campaign's own $1.825 hard ceiling remain unchanged.
  if v_policy.max_authorized_cost_usd is not null
     and round(v_window_authorized + v_next_cost,6) > round(v_policy.max_authorized_cost_usd,6) then
    return jsonb_build_object(
      'ok',true,
      'authorized',false,
      'reason','rolling_budget_exhausted',
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'nextBudgetReleaseAt',v_next_budget_release_at,
      'automaticPromotionAuthorized',false,
      'runpodMutationAuthorized',false,
      'authorityExpanded',false
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
      select 1 from public.cos_university_mass_distillation_batch_runs r
      where r.batch_key = b.batch_key
    )
  order by b.prepared_at asc, b.batch_key asc
  for update skip locked
  limit v_policy.batches_per_campaign;

  if v_batch_key is null then
    return jsonb_build_object(
      'ok',true,
      'authorized',false,
      'reason','no_prepared_batch',
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6) end,
      'automaticPromotionAuthorized',false,
      'runpodMutationAuthorized',false,
      'authorityExpanded',false
    );
  end if;

  v_campaign_id := public.authorize_cos_university_mass_distillation_campaign(
    array[v_batch_key],
    v_next_cost,
    v_policy.authorization_ref,
    v_policy.campaign_valid_for
  );

  update public.cos_university_mass_distillation_rolling_policy p
  set last_campaign_authorized_at = v_now, updated_at = v_now
  where p.policy_key = v_policy.policy_key;

  return jsonb_build_object(
    'ok',true,
    'authorized',true,
    'reason','campaign_authorized',
    'campaignId',v_campaign_id,
    'batchKey',v_batch_key,
    'batchCount',1,
    'campaignMaximumAuthorizedCostUsd',v_next_cost,
    'rollingWindowHours',24,
    'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingCeilingRemoved',v_policy.max_authorized_cost_usd is null,
    'rollingAuthorizedCostUsd',round(v_window_authorized+v_next_cost,6),
    'rollingRemainingAuthorizedCostUsd',case when v_policy.max_authorized_cost_usd is null then null else round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized-v_next_cost),6) end,
    'authorizationRef',v_policy.authorization_ref,
    'automaticPromotionAuthorized',false,
    'runpodMutationAuthorized',false,
    'authorityExpanded',false
  );
end;
$$;

revoke all on function public.authorize_next_cos_university_mass_distillation_campaign()
  from public, anon, authenticated;
grant execute on function public.authorize_next_cos_university_mass_distillation_campaign()
  to service_role;

notify pgrst, 'reload schema';
