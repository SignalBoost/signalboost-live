-- Provider-job spend settlement and bounded one-time campaign recovery for mass distillation.
--
-- Campaign committed_cost_usd is defined as conservative observed spend + live provider reserves.
-- A hard stage ceiling is reserved before provider dispatch. Once the provider Job reaches a terminal
-- state, the unused portion is released exactly once. No provider retry, promotion, Production traffic,
-- or RunPod mutation is authorized by this migration.

create table if not exists public.cos_university_mass_distillation_provider_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.cos_university_mass_distillation_campaigns(id) on delete restrict,
  run_id uuid not null references public.cos_university_mass_distillation_batch_runs(id) on delete restrict,
  batch_key text not null,
  candidate_id text not null,
  subject_id text not null,
  operation text not null check (operation in ('teacher','preparation','training')),
  job_id text not null unique check (length(btrim(job_id)) between 3 and 240),
  job_url text,
  idempotency_key text not null check (idempotency_key ~ '^[a-f0-9]{64}$'),
  reserved_cost_usd numeric(10,6) not null check (reserved_cost_usd > 0),
  hourly_cost_usd numeric(10,6) not null check (hourly_cost_usd > 0),
  timeout_seconds integer not null check (timeout_seconds > 0),
  provider_stage text check (provider_stage is null or provider_stage in ('COMPLETED','CANCELED','ERROR','DELETED','SCHEDULING','RUNNING')),
  observed_cost_usd numeric(10,6) check (observed_cost_usd is null or (observed_cost_usd >= 0 and observed_cost_usd <= reserved_cost_usd)),
  failure_reason text,
  dispatched_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_mass_distillation_provider_jobs_unsettled_idx
  on public.cos_university_mass_distillation_provider_jobs(settled_at, dispatched_at asc)
  where settled_at is null;
create index if not exists cos_mass_distillation_provider_jobs_run_idx
  on public.cos_university_mass_distillation_provider_jobs(run_id, operation, dispatched_at desc);

alter table public.cos_university_mass_distillation_provider_jobs enable row level security;
revoke all on table public.cos_university_mass_distillation_provider_jobs from public, anon, authenticated;
grant select, insert, update on table public.cos_university_mass_distillation_provider_jobs to service_role;

comment on table public.cos_university_mass_distillation_provider_jobs is
  'Durable provider-job ledger for mass distillation. Each accepted provider Job carries its reserved ceiling until terminal provider status settles conservative observed spend exactly once.';

-- Backfill any Jobs that predate this provider ledger from durable dispatch/reconciliation evidence.
with recorded_jobs as (
  select r.campaign_id, r.id as run_id, r.batch_key, r.candidate_id, r.subject_id,
         'teacher'::text as operation, r.teacher_job_id as job_id, r.teacher_job_url as job_url
  from public.cos_university_mass_distillation_batch_runs r where r.teacher_job_id is not null
  union all
  select r.campaign_id, r.id, r.batch_key, r.candidate_id, r.subject_id,
         'preparation'::text, r.preparation_job_id, r.preparation_job_url
  from public.cos_university_mass_distillation_batch_runs r where r.preparation_job_id is not null
  union all
  select r.campaign_id, r.id, r.batch_key, r.candidate_id, r.subject_id,
         'training'::text, r.training_job_id, r.training_job_url
  from public.cos_university_mass_distillation_batch_runs r where r.training_job_id is not null
), hydrated as (
  select j.*,
    d.evidence as dispatch_evidence,
    d.observed_at as dispatch_observed_at,
    t.evidence as terminal_evidence,
    t.observed_at as terminal_observed_at
  from recorded_jobs j
  left join lateral (
    select e.evidence, e.observed_at
    from public.cos_university_learning_assurance_events e
    where e.candidate_id = j.candidate_id
      and e.event_type = 'fine_tune'
      and e.evidence->>'claim' = 'mass_distillation_job_dispatched'
      and e.evidence->>'jobId' = j.job_id
    order by e.observed_at desc limit 1
  ) d on true
  left join lateral (
    select e.evidence, e.observed_at
    from public.cos_university_learning_assurance_events e
    where e.candidate_id = j.candidate_id
      and e.event_type = 'fine_tune'
      and e.evidence->>'profile' = 'cos-university-mass-distillation-hf-reconcile-v1'
      and e.evidence->>'claim' = 'mass_distillation_provider_terminal_reconciled'
      and e.evidence->>'jobId' = j.job_id
    order by e.observed_at desc limit 1
  ) t on true
)
insert into public.cos_university_mass_distillation_provider_jobs (
  campaign_id, run_id, batch_key, candidate_id, subject_id, operation,
  job_id, job_url, idempotency_key, reserved_cost_usd, hourly_cost_usd, timeout_seconds,
  provider_stage, observed_cost_usd, failure_reason, dispatched_at, settled_at
)
select
  h.campaign_id, h.run_id, h.batch_key, h.candidate_id, h.subject_id, h.operation,
  h.job_id, h.job_url,
  coalesce(nullif(h.dispatch_evidence->>'idempotencyKey',''), encode(extensions.digest(convert_to(h.job_id,'UTF8'),'sha256'),'hex')),
  coalesce(nullif(h.dispatch_evidence->>'reservedCostCeilingUsd','')::numeric,
    case h.operation when 'teacher' then 0.200000 when 'preparation' then 0.015000 else 1.610000 end),
  coalesce(nullif(h.dispatch_evidence->>'hourlyCostUsd','')::numeric, 0.400000),
  coalesce(nullif(h.dispatch_evidence->>'timeoutSeconds','')::integer,
    case h.operation when 'training' then 14400 else 1800 end),
  nullif(h.terminal_evidence->>'providerStage',''),
  nullif(h.terminal_evidence->>'observedCostUsd','')::numeric,
  case when h.terminal_evidence is not null then nullif(h.terminal_evidence->>'providerMessage','') else null end,
  coalesce(h.dispatch_observed_at, now()),
  h.terminal_observed_at
from hydrated h
on conflict (job_id) do nothing;

create or replace function public.record_cos_university_mass_distillation_provider_job(
  p_run_id uuid,
  p_dispatch_stage text,
  p_idempotency_key text,
  p_job_id text,
  p_job_url text,
  p_reserved_cost_usd numeric,
  p_hourly_cost_usd numeric,
  p_timeout_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.cos_university_mass_distillation_batch_runs%rowtype;
  v_operation text;
  v_next_stage text;
  v_now timestamptz := clock_timestamp();
begin
  select r.* into v_run
  from public.cos_university_mass_distillation_batch_runs r
  where r.id = p_run_id
  for update;
  if not found then raise exception 'mass_distillation_provider_record_run_missing'; end if;

  if p_dispatch_stage not in ('teacher_dispatching','preparation_dispatching','training_dispatching')
    or v_run.stage <> p_dispatch_stage then
    raise exception 'mass_distillation_provider_record_stage_mismatch';
  end if;
  if p_idempotency_key is null or p_idempotency_key !~ '^[a-f0-9]{64}$'
    or v_run.stage_idempotency_key <> p_idempotency_key then
    raise exception 'mass_distillation_provider_record_idempotency_mismatch';
  end if;
  if length(btrim(coalesce(p_job_id,''))) < 3 then
    raise exception 'mass_distillation_provider_record_job_invalid';
  end if;
  if round(coalesce(p_reserved_cost_usd,0),6) <> round(coalesce(v_run.stage_reserved_cost_usd,0),6) then
    raise exception 'mass_distillation_provider_record_reserve_mismatch';
  end if;
  if p_hourly_cost_usd is null or p_hourly_cost_usd <= 0 or p_timeout_seconds is null or p_timeout_seconds <= 0 then
    raise exception 'mass_distillation_provider_record_cost_metadata_invalid';
  end if;

  if p_dispatch_stage = 'teacher_dispatching' then
    v_operation := 'teacher'; v_next_stage := 'teacher_dispatched';
  elsif p_dispatch_stage = 'preparation_dispatching' then
    v_operation := 'preparation'; v_next_stage := 'preparation_dispatched';
  else
    v_operation := 'training'; v_next_stage := 'training_dispatched';
  end if;

  insert into public.cos_university_mass_distillation_provider_jobs (
    campaign_id, run_id, batch_key, candidate_id, subject_id, operation,
    job_id, job_url, idempotency_key, reserved_cost_usd, hourly_cost_usd, timeout_seconds,
    dispatched_at, created_at, updated_at
  ) values (
    v_run.campaign_id, v_run.id, v_run.batch_key, v_run.candidate_id, v_run.subject_id, v_operation,
    btrim(p_job_id), nullif(btrim(coalesce(p_job_url,'')),''), p_idempotency_key,
    round(p_reserved_cost_usd,6), round(p_hourly_cost_usd,6), p_timeout_seconds,
    v_now, v_now, v_now
  );

  if v_operation = 'teacher' then
    update public.cos_university_mass_distillation_batch_runs r
    set teacher_job_id=btrim(p_job_id), teacher_job_url=nullif(btrim(coalesce(p_job_url,'')),''),
        stage=v_next_stage, updated_at=v_now
    where r.id=v_run.id;
  elsif v_operation = 'preparation' then
    update public.cos_university_mass_distillation_batch_runs r
    set preparation_job_id=btrim(p_job_id), preparation_job_url=nullif(btrim(coalesce(p_job_url,'')),''),
        stage=v_next_stage, updated_at=v_now
    where r.id=v_run.id;
  else
    update public.cos_university_mass_distillation_batch_runs r
    set training_job_id=btrim(p_job_id), training_job_url=nullif(btrim(coalesce(p_job_url,'')),''),
        stage=v_next_stage, updated_at=v_now
    where r.id=v_run.id;
  end if;

  return jsonb_build_object(
    'recorded',true,'jobId',btrim(p_job_id),'operation',v_operation,'stage',v_next_stage,
    'reservedCostUsd',round(p_reserved_cost_usd,6),'authorityExpanded',false
  );
end;
$$;

revoke all on function public.record_cos_university_mass_distillation_provider_job(uuid,text,text,text,text,numeric,numeric,integer)
  from public, anon, authenticated;
grant execute on function public.record_cos_university_mass_distillation_provider_job(uuid,text,text,text,text,numeric,numeric,integer)
  to service_role;

create or replace function public.settle_cos_university_mass_distillation_provider_job(
  p_job_id text,
  p_provider_stage text,
  p_failure_reason text,
  p_observed_cost_usd numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.cos_university_mass_distillation_provider_jobs%rowtype;
  v_run public.cos_university_mass_distillation_batch_runs%rowtype;
  v_campaign public.cos_university_mass_distillation_campaigns%rowtype;
  v_observed numeric(10,6);
  v_release numeric(10,6);
  v_expected_dispatched text;
  v_workflow_failed boolean := false;
  v_reason text;
  v_now timestamptz := clock_timestamp();
begin
  if p_provider_stage not in ('COMPLETED','CANCELED','ERROR','DELETED') then
    raise exception 'mass_distillation_provider_settle_stage_not_terminal';
  end if;

  select j.* into v_job
  from public.cos_university_mass_distillation_provider_jobs j
  where j.job_id=btrim(p_job_id)
  for update;
  if not found then raise exception 'mass_distillation_provider_settle_job_missing'; end if;
  if v_job.settled_at is not null then
    return jsonb_build_object(
      'settled',false,'reason','already_settled','jobId',v_job.job_id,
      'observedCostUsd',v_job.observed_cost_usd,'providerStage',v_job.provider_stage
    );
  end if;

  v_observed := least(v_job.reserved_cost_usd, greatest(0, round(coalesce(p_observed_cost_usd,v_job.reserved_cost_usd),6)));
  v_release := greatest(0, v_job.reserved_cost_usd-v_observed);

  select c.* into v_campaign
  from public.cos_university_mass_distillation_campaigns c
  where c.id=v_job.campaign_id
  for update;
  if not found then raise exception 'mass_distillation_provider_settle_campaign_missing'; end if;

  select r.* into v_run
  from public.cos_university_mass_distillation_batch_runs r
  where r.id=v_job.run_id
  for update;
  if not found then raise exception 'mass_distillation_provider_settle_run_missing'; end if;

  update public.cos_university_mass_distillation_campaigns c
  set committed_cost_usd=greatest(0,c.committed_cost_usd-v_release), updated_at=v_now
  where c.id=v_campaign.id;

  if v_job.operation='teacher' then v_expected_dispatched := 'teacher_dispatched';
  elsif v_job.operation='preparation' then v_expected_dispatched := 'preparation_dispatched';
  else v_expected_dispatched := 'training_dispatched'; end if;

  if p_provider_stage <> 'COMPLETED' then
    v_workflow_failed := v_run.stage <> 'complete';
    v_reason := left(coalesce(nullif(btrim(coalesce(p_failure_reason,'')),''),'huggingface_provider_' || lower(p_provider_stage)),500);
  elsif v_run.stage = v_expected_dispatched then
    v_workflow_failed := true;
    v_reason := left(coalesce(nullif(btrim(coalesce(p_failure_reason,'')),''),'huggingface_completed_without_callback'),500);
  end if;

  if v_workflow_failed then
    update public.cos_university_mass_distillation_batch_runs r
    set stage='failed', stage_reserved_cost_usd=0, failure_reason=v_reason, updated_at=v_now
    where r.id=v_run.id;
    update public.cos_university_mass_distillation_campaigns c
    set status='failed', updated_at=v_now
    where c.id=v_campaign.id and c.status in ('authorized','active');
  elsif v_run.stage = v_expected_dispatched then
    update public.cos_university_mass_distillation_batch_runs r
    set stage_reserved_cost_usd=0, updated_at=v_now where r.id=v_run.id;
  end if;

  update public.cos_university_mass_distillation_provider_jobs j
  set provider_stage=p_provider_stage,
      observed_cost_usd=v_observed,
      failure_reason=case when p_provider_stage='COMPLETED' then null else v_reason end,
      settled_at=v_now, updated_at=v_now
  where j.id=v_job.id;

  return jsonb_build_object(
    'settled',true,'jobId',v_job.job_id,'operation',v_job.operation,'providerStage',p_provider_stage,
    'reservedCostUsd',v_job.reserved_cost_usd,'observedCostUsd',v_observed,
    'releasedUnusedReserveUsd',v_release,
    'campaignCommittedCostUsd',greatest(0,v_campaign.committed_cost_usd-v_release),
    'workflowFailed',v_workflow_failed,'automaticRetryAuthorized',false,'authorityExpanded',false
  );
end;
$$;

revoke all on function public.settle_cos_university_mass_distillation_provider_job(text,text,text,numeric)
  from public, anon, authenticated;
grant execute on function public.settle_cos_university_mass_distillation_provider_job(text,text,text,numeric)
  to service_role;

-- A pending stage cannot consume another reserve while any prior accepted provider Job for that run
-- remains unsettled. This serializes provider cost evidence before the next stage can start.
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

-- Explicit recovery only. It never increases the campaign maximum and allows at most one accepted
-- provider retry per operation (two accepted Jobs total per run/operation including the original).
create or replace function public.recover_cos_university_mass_distillation_campaign(
  p_campaign_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.cos_university_mass_distillation_campaigns%rowtype;
  v_release numeric(10,6) := 0;
  v_rearmed integer := 0;
  v_now timestamptz := clock_timestamp();
  v_evidence jsonb;
  v_hash text;
  v_key text;
begin
  if length(btrim(coalesce(p_reason,''))) < 12 then
    raise exception 'mass_distillation_recovery_reason_invalid';
  end if;
  select c.* into v_campaign
  from public.cos_university_mass_distillation_campaigns c
  where c.id=p_campaign_id
  for update;
  if not found then raise exception 'mass_distillation_recovery_campaign_missing'; end if;
  if v_campaign.status <> 'failed' then raise exception 'mass_distillation_recovery_campaign_not_failed'; end if;
  if v_campaign.expires_at <= v_now then raise exception 'mass_distillation_recovery_campaign_expired'; end if;
  if v_campaign.automatic_promotion_authorized <> false or v_campaign.runpod_mutation_authorized <> false or v_campaign.authority_expanded <> false then
    raise exception 'mass_distillation_recovery_authority_invalid';
  end if;
  if exists (
    select 1 from public.cos_university_mass_distillation_provider_jobs j
    where j.campaign_id=p_campaign_id and j.settled_at is null
  ) then
    raise exception 'mass_distillation_recovery_provider_job_unsettled';
  end if;

  -- Release only a failed reservation that never produced a provider Job. Current provider-rejected
  -- submissions (for example HTTP 413) are safe to release because no billable Job id was accepted.
  select coalesce(sum(r.stage_reserved_cost_usd),0) into v_release
  from public.cos_university_mass_distillation_batch_runs r
  where r.campaign_id=p_campaign_id
    and r.stage='failed'
    and r.stage_reserved_cost_usd > 0
    and r.failure_reason like 'huggingface_training_job_rejected:%'
    and r.teacher_job_id is null and r.preparation_job_id is null and r.training_job_id is null;

  if v_release > 0 then
    update public.cos_university_mass_distillation_campaigns c
    set committed_cost_usd=greatest(0,c.committed_cost_usd-v_release),updated_at=v_now
    where c.id=p_campaign_id;
    update public.cos_university_mass_distillation_batch_runs r
    set stage_reserved_cost_usd=0,updated_at=v_now
    where r.campaign_id=p_campaign_id and r.stage='failed' and r.stage_reserved_cost_usd > 0
      and r.failure_reason like 'huggingface_training_job_rejected:%'
      and r.teacher_job_id is null and r.preparation_job_id is null and r.training_job_id is null;
  end if;

  -- Reject recovery if any failed operation has already consumed two accepted provider attempts.
  if exists (
    select 1
    from public.cos_university_mass_distillation_batch_runs r
    where r.campaign_id=p_campaign_id and r.stage='failed'
      and (
        (r.training_data_ref is not null and (select count(*) from public.cos_university_mass_distillation_provider_jobs j where j.run_id=r.id and j.operation='training') >= 2)
        or (r.training_data_ref is null and r.teacher_source_ref is not null and (select count(*) from public.cos_university_mass_distillation_provider_jobs j where j.run_id=r.id and j.operation='preparation') >= 2)
        or (r.teacher_source_ref is null and (select count(*) from public.cos_university_mass_distillation_provider_jobs j where j.run_id=r.id and j.operation='teacher') >= 2)
      )
  ) then
    raise exception 'mass_distillation_recovery_retry_ceiling_reached';
  end if;

  with recovered as (
    update public.cos_university_mass_distillation_batch_runs r
    set stage = case
          when r.training_data_ref is not null and r.holdout_data_ref is not null then 'training_pending'
          when r.teacher_source_ref is not null then 'preparation_pending'
          else 'teacher_pending'
        end,
        teacher_job_id = case when r.teacher_source_ref is null then null else r.teacher_job_id end,
        teacher_job_url = case when r.teacher_source_ref is null then null else r.teacher_job_url end,
        preparation_job_id = case when r.teacher_source_ref is not null and r.training_data_ref is null then null else r.preparation_job_id end,
        preparation_job_url = case when r.teacher_source_ref is not null and r.training_data_ref is null then null else r.preparation_job_url end,
        training_job_id = case when r.training_data_ref is not null then null else r.training_job_id end,
        training_job_url = case when r.training_data_ref is not null then null else r.training_job_url end,
        stage_reserved_cost_usd=0,
        stage_idempotency_key=null,
        claimed_at=null,
        failure_reason=null,
        updated_at=v_now
    where r.campaign_id=p_campaign_id and r.stage='failed'
    returning 1
  ) select count(*) into v_rearmed from recovered;

  update public.cos_university_mass_distillation_campaigns c
  set status='active',updated_at=v_now
  where c.id=p_campaign_id;

  select c.* into v_campaign from public.cos_university_mass_distillation_campaigns c where c.id=p_campaign_id;
  if v_campaign.committed_cost_usd > v_campaign.max_total_cost_usd then
    raise exception 'mass_distillation_recovery_budget_invalid';
  end if;

  v_evidence := jsonb_build_object(
    'profile','cos-university-mass-distillation-campaign-v1',
    'claim','mass_distillation_campaign_recovered',
    'campaignId',p_campaign_id,
    'reason',left(btrim(p_reason),500),
    'rearmedRuns',v_rearmed,
    'releasedPreProviderReserveUsd',v_release,
    'committedCostUsd',v_campaign.committed_cost_usd,
    'maxTotalCostUsd',v_campaign.max_total_cost_usd,
    'retryCeilingAcceptedJobsPerOperation',2,
    'automaticPromotionAuthorized',false,
    'runpodMutationAuthorized',false,
    'authorityExpanded',false
  );
  v_hash := encode(extensions.digest(convert_to(v_evidence::text,'UTF8'),'sha256'),'hex');
  v_key := encode(extensions.digest(convert_to('mass-distillation-recovery:' || p_campaign_id::text || ':' || v_now::text,'UTF8'),'sha256'),'hex');
  insert into public.cos_university_learning_assurance_events (
    event_key,event_type,candidate_id,evidence_hash,evidence,verifier,observed_at
  ) values (
    v_key,'fine_tune','mass-campaign:' || p_campaign_id::text,v_hash,v_evidence,'host_controller',v_now
  );

  return jsonb_build_object(
    'recovered',true,'campaignId',p_campaign_id,'rearmedRuns',v_rearmed,
    'releasedPreProviderReserveUsd',v_release,'committedCostUsd',v_campaign.committed_cost_usd,
    'maxTotalCostUsd',v_campaign.max_total_cost_usd,'automaticRetryAuthorized',false,
    'authorityExpanded',false
  );
end;
$$;

revoke all on function public.recover_cos_university_mass_distillation_campaign(uuid,text)
  from public, anon, authenticated;
grant execute on function public.recover_cos_university_mass_distillation_campaign(uuid,text) to service_role;
