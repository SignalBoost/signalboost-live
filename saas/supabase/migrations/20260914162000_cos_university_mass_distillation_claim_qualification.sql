-- Follow-up to 20260914155000_cos_university_mass_distillation_campaign_consumer.sql.
-- `RETURNS TABLE` creates PL/pgSQL output variables named campaign_id, stage, etc. Unqualified
-- references to identically named table columns are therefore ambiguous at runtime. Qualify every
-- batch-run reference so the first campaign claim can execute without reserving/spending twice.

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
  v_new_stage text;
  v_ceiling numeric(10,6);
begin
  select c.* into v_campaign
  from public.cos_university_mass_distillation_campaigns c
  where c.id = p_campaign_id
  for update;
  if not found then raise exception 'mass_distillation_campaign_missing'; end if;
  if v_campaign.status not in ('authorized','active') then return; end if;
  if v_campaign.expires_at <= clock_timestamp() then
    update public.cos_university_mass_distillation_campaigns c
      set status='expired', updated_at=clock_timestamp()
      where c.id=p_campaign_id;
    return;
  end if;

  select r.* into v_run
  from public.cos_university_mass_distillation_batch_runs r
  where r.campaign_id = p_campaign_id
    and r.stage in ('teacher_pending','preparation_pending','training_pending')
  order by r.batch_key
  for update skip locked
  limit 1;

  if not found then
    if not exists (
      select 1 from public.cos_university_mass_distillation_batch_runs r
      where r.campaign_id=p_campaign_id and r.stage <> 'complete'
    ) then
      update public.cos_university_mass_distillation_campaigns c
      set status='completed', completed_at=coalesce(c.completed_at,clock_timestamp()), updated_at=clock_timestamp()
      where c.id=p_campaign_id;
    end if;
    return;
  end if;

  if v_run.stage='teacher_pending' then
    v_new_stage := 'teacher_dispatching'; v_ceiling := 0.200000;
  elsif v_run.stage='preparation_pending' then
    v_new_stage := 'preparation_dispatching'; v_ceiling := 0.015000;
  elsif v_run.stage='training_pending' then
    v_new_stage := 'training_dispatching'; v_ceiling := 1.610000;
  else
    raise exception 'mass_distillation_campaign_stage_invalid';
  end if;

  if v_campaign.committed_cost_usd + v_ceiling > v_campaign.max_total_cost_usd then
    raise exception 'mass_distillation_campaign_budget_exhausted';
  end if;

  update public.cos_university_mass_distillation_campaigns c
    set status='active', committed_cost_usd=c.committed_cost_usd+v_ceiling, updated_at=clock_timestamp()
    where c.id=p_campaign_id;
  update public.cos_university_mass_distillation_batch_runs r
    set stage=v_new_stage, stage_reserved_cost_usd=v_ceiling, claimed_at=clock_timestamp(), updated_at=clock_timestamp()
    where r.id=v_run.id;

  return query select
    v_run.id, v_run.campaign_id, v_run.batch_key, v_run.candidate_id,
    v_run.subject_id, v_run.student_model_id, v_new_stage, v_ceiling;
end;
$$;

revoke all on function public.claim_cos_university_mass_distillation_stage(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_cos_university_mass_distillation_stage(uuid)
  to service_role;
