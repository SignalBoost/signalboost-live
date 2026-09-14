-- Durable settlement for provider-terminal Hugging Face Jobs that did not produce their signed callback.
-- The provider status reader is read-only. This RPC only settles an already-dispatched recorded job,
-- clears the live stage reserve, and keeps conservative observed provider cost committed to the owner
-- campaign ceiling. It never retries, promotes, authorizes Production traffic, or mutates RunPod.

create or replace function public.settle_cos_university_mass_distillation_provider_terminal(
  p_run_id uuid,
  p_job_id text,
  p_failure_reason text,
  p_observed_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.cos_university_mass_distillation_batch_runs%rowtype;
  v_campaign public.cos_university_mass_distillation_campaigns%rowtype;
  v_expected_job_id text;
  v_reserved numeric(10,6);
  v_observed numeric(10,6);
  v_release numeric(10,6);
  v_now timestamptz := clock_timestamp();
begin
  select r.* into v_run
  from public.cos_university_mass_distillation_batch_runs r
  where r.id = p_run_id
  for update;
  if not found then raise exception 'mass_distillation_reconcile_run_missing'; end if;

  if v_run.stage = 'teacher_dispatched' then
    v_expected_job_id := v_run.teacher_job_id;
  elsif v_run.stage = 'preparation_dispatched' then
    v_expected_job_id := v_run.preparation_job_id;
  elsif v_run.stage = 'training_dispatched' then
    v_expected_job_id := v_run.training_job_id;
  else
    return jsonb_build_object('settled', false, 'reason', 'run_not_dispatched', 'stage', v_run.stage);
  end if;

  if length(btrim(coalesce(p_job_id,''))) < 3
    or v_expected_job_id is null
    or v_expected_job_id <> btrim(p_job_id) then
    raise exception 'mass_distillation_reconcile_job_binding_mismatch';
  end if;
  if length(btrim(coalesce(p_failure_reason,''))) < 3 then
    raise exception 'mass_distillation_reconcile_failure_reason_invalid';
  end if;

  select c.* into v_campaign
  from public.cos_university_mass_distillation_campaigns c
  where c.id = v_run.campaign_id
  for update;
  if not found then raise exception 'mass_distillation_reconcile_campaign_missing'; end if;

  v_reserved := greatest(0, coalesce(v_run.stage_reserved_cost_usd, 0));
  v_observed := least(v_reserved, greatest(0, coalesce(round(p_observed_cost_usd, 6), v_reserved)));
  v_release := greatest(0, v_reserved - v_observed);

  update public.cos_university_mass_distillation_campaigns c
  set committed_cost_usd = greatest(0, c.committed_cost_usd - v_release),
      status = case when c.status in ('authorized','active') then 'failed' else c.status end,
      updated_at = v_now
  where c.id = v_campaign.id;

  update public.cos_university_mass_distillation_batch_runs r
  set stage = 'failed',
      stage_reserved_cost_usd = 0,
      failure_reason = left(btrim(p_failure_reason), 500),
      updated_at = v_now
  where r.id = v_run.id;

  return jsonb_build_object(
    'settled', true,
    'runId', v_run.id,
    'campaignId', v_run.campaign_id,
    'jobId', v_expected_job_id,
    'reservedCostUsd', v_reserved,
    'observedCostUsd', v_observed,
    'releasedUnusedReserveUsd', v_release,
    'campaignCommittedCostUsd', greatest(0, v_campaign.committed_cost_usd - v_release),
    'automaticRetryAuthorized', false,
    'authorityExpanded', false
  );
end;
$$;

revoke all on function public.settle_cos_university_mass_distillation_provider_terminal(uuid,text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.settle_cos_university_mass_distillation_provider_terminal(uuid,text,text,numeric)
  to service_role;
