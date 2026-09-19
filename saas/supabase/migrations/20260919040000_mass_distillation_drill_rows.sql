-- saas/supabase/migrations/20260919040000_mass_distillation_drill_rows.sql
-- Self-healing recovery drill: a deliberately injected, deliberately inert fault.
--
-- Item 12 requires proving that a stopped distillation control loop is detected, repaired and resumed
-- with no owner intervention. The fault the Supervisor already repairs is a batch run stuck in a
-- *_dispatching stage, and the monitor only sees runs belonging to an ACTIVE campaign - so a credible
-- drill row has to live in the real table under a real campaign, exactly where the consumer would find
-- it. Without a guard, a drill would hand a fabricated job to the dispatcher and spend real training
-- money. A self-healing test that buys a fake HF Job is worse than having no test.
--
-- Two layers, because the claim path has ten call sites in TypeScript and one missed predicate is a paid
-- mistake:
--   1. the single SQL claim function excludes drill rows, and
--   2. a trigger refuses ANY stage transition on a drill row, so no code path can dispatch one whatever
--      it believes it is doing.
--
-- Nothing here grants authority: drill rows carry no budget, cannot be claimed, cannot change stage, and
-- are deleted by the drill's own rollback obligation.

alter table public.cos_university_mass_distillation_batch_runs
  add column if not exists drill_id text;

comment on column public.cos_university_mass_distillation_batch_runs.drill_id is
  'Non-null marks a Self-Healing recovery drill fixture: visible to the monitor, never claimable, never dispatchable, removed by the drill rollback.';

-- The monitor scans by campaign and stage; this keeps drill lookups and cleanup cheap without widening
-- any existing access path.
create index if not exists cos_university_mass_distillation_batch_runs_drill_idx
  on public.cos_university_mass_distillation_batch_runs (drill_id)
  where drill_id is not null;

-- Backstop: a drill row is frozen at the stage it was injected with. Any attempt to advance it - by the
-- consumer, a reconciler, a repair path, or a future caller that does not know drills exist - fails loudly
-- instead of quietly becoming real work.
create or replace function public.guard_cos_university_mass_distillation_drill_row()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.drill_id is not null and new.stage is distinct from old.stage then
    raise exception 'mass_distillation_drill_row_stage_immutable';
  end if;
  if old.drill_id is not null and new.drill_id is null then
    raise exception 'mass_distillation_drill_row_marker_immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists cos_university_mass_distillation_drill_guard
  on public.cos_university_mass_distillation_batch_runs;
create trigger cos_university_mass_distillation_drill_guard
  before update on public.cos_university_mass_distillation_batch_runs
  for each row
  execute function public.guard_cos_university_mass_distillation_drill_row();

-- Recreated with the drill exclusion. Every other predicate, ceiling, budget check and return shape is
-- unchanged from 20260914180000.
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
  where c.id=p_campaign_id
  for update;
  if not found then raise exception 'mass_distillation_campaign_missing'; end if;
  if v_campaign.status not in ('authorized','active') then return; end if;
  if v_campaign.expires_at <= clock_timestamp() then
    update public.cos_university_mass_distillation_campaigns c
      set status='expired',updated_at=clock_timestamp() where c.id=p_campaign_id;
    return;
  end if;

  select r.* into v_run
  from public.cos_university_mass_distillation_batch_runs r
  where r.campaign_id=p_campaign_id
    and r.stage in ('teacher_pending','preparation_pending','training_pending')
    -- Self-healing drill rows are observable faults, never work. They must remain visible to the
    -- monitor and invisible to dispatch; the trigger below is the backstop if any caller forgets.
    and r.drill_id is null
    and not exists (
      select 1 from public.cos_university_mass_distillation_provider_jobs j
      where j.run_id=r.id and j.settled_at is null
    )
  order by r.batch_key
  for update skip locked
  limit 1;

  if not found then
    if not exists (
      select 1 from public.cos_university_mass_distillation_batch_runs r
      where r.campaign_id=p_campaign_id and r.stage <> 'complete'
    ) then
      update public.cos_university_mass_distillation_campaigns c
      set status='completed',completed_at=coalesce(c.completed_at,clock_timestamp()),updated_at=clock_timestamp()
      where c.id=p_campaign_id;
    end if;
    return;
  end if;

  if v_run.stage='teacher_pending' then v_new_stage:='teacher_dispatching'; v_ceiling:=0.200000;
  elsif v_run.stage='preparation_pending' then v_new_stage:='preparation_dispatching'; v_ceiling:=0.015000;
  elsif v_run.stage='training_pending' then v_new_stage:='training_dispatching'; v_ceiling:=1.610000;
  else raise exception 'mass_distillation_campaign_stage_invalid'; end if;

  if v_campaign.committed_cost_usd+v_ceiling > v_campaign.max_total_cost_usd then
    raise exception 'mass_distillation_campaign_budget_exhausted';
  end if;

  update public.cos_university_mass_distillation_campaigns c
  set status='active',committed_cost_usd=c.committed_cost_usd+v_ceiling,updated_at=clock_timestamp()
  where c.id=p_campaign_id;
  update public.cos_university_mass_distillation_batch_runs r
  set stage=v_new_stage,stage_reserved_cost_usd=v_ceiling,claimed_at=clock_timestamp(),updated_at=clock_timestamp()
  where r.id=v_run.id;

  return query select v_run.id,v_run.campaign_id,v_run.batch_key,v_run.candidate_id,
    v_run.subject_id,v_run.student_model_id,v_new_stage,v_ceiling;
end;
$$;

revoke all on function public.claim_cos_university_mass_distillation_stage(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_cos_university_mass_distillation_stage(uuid) to service_role;
