-- Follow-up to the provider-spend migration.
-- The campaign table intentionally has no failure_reason column; failure evidence lives on batch runs
-- and assurance events. Recovery therefore changes campaign status only after bounded run re-arm.

create or replace function public.rearm_cos_university_mass_distillation_campaign(
  p_campaign_id uuid,
  p_source text
)
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
    order by r.batch_key asc
    for update
  loop
    if v_run.training_job_id is not null then v_operation:='training'; v_pending_stage:='training_pending';
    elsif v_run.preparation_job_id is not null then v_operation:='preparation'; v_pending_stage:='preparation_pending';
    else v_operation:='teacher'; v_pending_stage:='teacher_pending'; end if;

    select count(*)::integer into v_accepted_attempts
    from public.cos_university_mass_distillation_provider_jobs j
    where j.run_id=v_run.id and j.operation=v_operation;

    -- A nonzero live stage reservation with no accepted provider Job is a known pre-provider rejection.
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
