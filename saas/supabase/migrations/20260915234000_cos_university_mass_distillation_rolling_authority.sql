-- Owner-authorized rolling continuity for COS University mass distillation.
--
-- The policy is intentionally narrower than a reusable spending account: it may authorize only
-- one already-prepared Qwen3-4B curriculum batch at a time, each campaign retains the existing
-- $1.825 hard ceiling, and every campaign authorized in the preceding 24 hours counts at its
-- maximum (not its eventual actual cost) against the owner's $25 rolling ceiling.

create table if not exists public.cos_university_mass_distillation_rolling_policy (
  policy_key text primary key check (policy_key = 'owner-rolling-24h-v1'),
  profile text not null default 'cos-university-mass-distillation-rolling-policy-v1'
    check (profile = 'cos-university-mass-distillation-rolling-policy-v1'),
  enabled boolean not null default false,
  provider text not null default 'huggingface' check (provider = 'huggingface'),
  scope text not null default 'mass_distillation_training_only'
    check (scope = 'mass_distillation_training_only'),
  rolling_window interval not null default interval '24 hours'
    check (rolling_window = interval '24 hours'),
  max_authorized_cost_usd numeric(10,6) not null
    check (max_authorized_cost_usd >= 1.825000 and max_authorized_cost_usd <= 25.000000),
  batches_per_campaign integer not null default 1 check (batches_per_campaign = 1),
  max_concurrent_campaigns integer not null default 1 check (max_concurrent_campaigns = 1),
  campaign_valid_for interval not null default interval '6 hours'
    check (campaign_valid_for > interval '0 seconds' and campaign_valid_for <= interval '6 hours'),
  authorization_ref text not null
    check (authorization_ref = 'owner_explicit_approval_2026-09-15_rolling_24h_max_25_usd'),
  automatic_promotion_authorized boolean not null default false
    check (automatic_promotion_authorized is false),
  runpod_mutation_authorized boolean not null default false
    check (runpod_mutation_authorized is false),
  authority_expanded boolean not null default false check (authority_expanded is false),
  authorized_at timestamptz not null,
  last_campaign_authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cos_university_mass_distillation_rolling_policy enable row level security;
revoke all on table public.cos_university_mass_distillation_rolling_policy from public, anon, authenticated;
grant select, update on table public.cos_university_mass_distillation_rolling_policy to service_role;

comment on table public.cos_university_mass_distillation_rolling_policy is
  'Owner-approved Hugging Face mass-distillation continuity ceiling. It cannot authorize promotion, Production traffic, RunPod mutation, non-prepared data, parallel campaigns, or more than $25 of maximum campaign authority in any rolling 24-hour window.';

insert into public.cos_university_mass_distillation_rolling_policy (
  policy_key,
  enabled,
  max_authorized_cost_usd,
  authorization_ref,
  authorized_at
) values (
  'owner-rolling-24h-v1',
  true,
  25.000000,
  'owner_explicit_approval_2026-09-15_rolling_24h_max_25_usd',
  clock_timestamp()
)
on conflict (policy_key) do nothing;

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
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6),
      'automaticPromotionAuthorized',false,
      'runpodMutationAuthorized',false,
      'authorityExpanded',false
    );
  end if;

  if round(v_window_authorized + v_next_cost,6) > round(v_policy.max_authorized_cost_usd,6) then
    return jsonb_build_object(
      'ok',true,
      'authorized',false,
      'reason','rolling_budget_exhausted',
      'rollingWindowHours',24,
      'rollingMaximumAuthorizedCostUsd',v_policy.max_authorized_cost_usd,
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6),
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
      'rollingAuthorizedCostUsd',round(v_window_authorized,6),
      'rollingRemainingAuthorizedCostUsd',round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized),6),
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
    'rollingAuthorizedCostUsd',round(v_window_authorized+v_next_cost,6),
    'rollingRemainingAuthorizedCostUsd',round(greatest(0,v_policy.max_authorized_cost_usd-v_window_authorized-v_next_cost),6),
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

-- Once rolling authority exists, the serialized wrapper is the only service-role campaign
-- authorization entry point. It holds the policy-row lock while checking the 24-hour ceiling,
-- active campaign count, and unsettled provider ledger. The wrapper is SECURITY DEFINER so it can
-- still call this owner-only primitive after direct service-role execution is removed.
revoke execute on function public.authorize_cos_university_mass_distillation_campaign(text[],numeric,text,interval)
  from service_role;

notify pgrst, 'reload schema';
