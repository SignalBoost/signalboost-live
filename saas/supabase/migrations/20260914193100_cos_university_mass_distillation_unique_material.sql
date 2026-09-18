-- Prevent storage-identity multiplicity from being treated as training-material diversity.
-- This migration is already applied in Production. It does not cancel accepted provider Jobs and
-- does not expand provider spend, retry, promotion, traffic, or RunPod authority.

with material_counts as (
  select
    b.id,
    count(distinct concat_ws(
      E'\x1f',
      lower(btrim(regexp_replace(coalesce(l.source_title,''), '[[:space:]]+', ' ', 'g'))),
      lower(btrim(regexp_replace(coalesce(l.summary,''), '[[:space:]]+', ' ', 'g'))),
      lower(btrim(regexp_replace(coalesce(l.facts::text,''), '[[:space:]]+', ' ', 'g')))
    )) as unique_material_count
  from public.cos_university_distillation_curriculum_batches b
  left join lateral unnest(b.source_hashes) sh(content_hash) on true
  left join public.cos_continuous_learning l on lower(l.content_hash)=lower(sh.content_hash)
  where b.status='prepared' and b.source_policy='public_domain_cc0_v1'
  group by b.id
)
update public.cos_university_distillation_curriculum_batches b
set status='quarantined', updated_at=clock_timestamp()
from material_counts m
where b.id=m.id and m.unique_material_count < 20;

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

  if v_run.stage='teacher_pending' then v_cost:=0.200000; v_next_stage:='teacher_dispatching';
  elsif v_run.stage='preparation_pending' then v_cost:=0.015000; v_next_stage:='preparation_dispatching';
  else v_cost:=1.610000; v_next_stage:='training_dispatching'; end if;

  if round(v_campaign.committed_cost_usd+v_cost,6) > round(v_campaign.max_total_cost_usd,6) then
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

revoke all on function public.claim_cos_university_mass_distillation_stage(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_cos_university_mass_distillation_stage(uuid) to service_role;

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
  v_release numeric(10,6);
  v_rearmed integer := 0;
  v_released numeric(10,6) := 0;
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
    order by r.batch_key asc
    for update
  loop
    if v_run.training_job_id is not null then v_operation:='training'; v_pending_stage:='training_pending';
    elsif v_run.preparation_job_id is not null then v_operation:='preparation'; v_pending_stage:='preparation_pending';
    else v_operation:='teacher'; v_pending_stage:='teacher_pending'; end if;

    select count(*)::integer into v_accepted_attempts
    from public.cos_university_mass_distillation_provider_jobs j
    where j.run_id=v_run.id and j.operation=v_operation;

    if v_run.stage_reserved_cost_usd > 0 and not exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=v_run.id and j.operation=v_operation
        and j.job_id = case v_operation
          when 'teacher' then v_run.teacher_job_id
          when 'preparation' then v_run.preparation_job_id
          else v_run.training_job_id end
    ) then
      v_release := v_run.stage_reserved_cost_usd;
      update public.cos_university_mass_distillation_campaigns c
      set committed_cost_usd=greatest(0,c.committed_cost_usd-v_release), updated_at=v_now
      where c.id=p_campaign_id;
      v_released := v_released + v_release;
    end if;

    if exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=v_run.id and j.operation=v_operation and j.settled_at is null
    ) then
      continue;
    end if;
    if v_accepted_attempts >= 2 then
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
    encode(extensions.digest(convert_to('mass-distillation-recovery:'||p_campaign_id::text||':'||v_now::text,'UTF8'),'sha256'),'hex'),
    'fine_tune','mass_distillation_campaign','mass-campaign:'||p_campaign_id::text,
    encode(extensions.digest(convert_to(p_campaign_id::text||':'||v_rearmed::text||':'||v_released::text||':'||btrim(p_source),'UTF8'),'sha256'),'hex'),
    jsonb_build_object(
      'profile','cos-university-mass-distillation-campaign-v1',
      'claim','mass_distillation_campaign_rearmed',
      'campaignId',p_campaign_id,
      'source',left(btrim(p_source),500),
      'rearmedRuns',v_rearmed,
      'releasedRejectedReserveUsd',round(v_released,6),
      'maxTotalCostUsd',v_campaign.max_total_cost_usd,
      'automaticRetryAuthorized',false,
      'automaticPromotionAuthorized',false,
      'runpodMutationAuthorized',false,
      'authorityExpanded',false
    ),
    'host_controller',v_now
  ) on conflict (event_key) do nothing;

  return jsonb_build_object(
    'campaignId',p_campaign_id,'rearmedRuns',v_rearmed,
    'releasedRejectedReserveUsd',round(v_released,6),
    'maxTotalCostUsd',v_campaign.max_total_cost_usd,
    'automaticRetryAuthorized',false,'automaticPromotionAuthorized',false,
    'runpodMutationAuthorized',false,'authorityExpanded',false
  );
end;
$$;

revoke all on function public.rearm_cos_university_mass_distillation_campaign(uuid,text)
  from public, anon, authenticated;
grant execute on function public.rearm_cos_university_mass_distillation_campaign(uuid,text) to service_role;
