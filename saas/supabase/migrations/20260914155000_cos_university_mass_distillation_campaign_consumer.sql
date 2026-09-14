-- Bounded paid consumer for the non-spending mass-distillation curriculum.
-- The curriculum table remains an identity-only queue and never becomes an authorization surface.
-- A campaign can spend only after an explicit owner authorization is recorded here, and each
-- claimed stage atomically reserves its existing hard one-time ceiling before provider dispatch.

create table if not exists public.cos_university_mass_distillation_campaigns (
  id uuid primary key default gen_random_uuid(),
  profile text not null default 'cos-university-mass-distillation-campaign-v1'
    check (profile = 'cos-university-mass-distillation-campaign-v1'),
  status text not null default 'authorized'
    check (status in ('authorized','active','completed','failed','cancelled','expired')),
  batch_keys text[] not null,
  batch_count integer not null check (batch_count between 1 and 20),
  max_total_cost_usd numeric(10,6) not null check (max_total_cost_usd > 0),
  committed_cost_usd numeric(10,6) not null default 0 check (committed_cost_usd >= 0),
  authorization_ref text not null check (length(btrim(authorization_ref)) between 8 and 500),
  authorized_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  automatic_promotion_authorized boolean not null default false check (automatic_promotion_authorized is false),
  runpod_mutation_authorized boolean not null default false check (runpod_mutation_authorized is false),
  authority_expanded boolean not null default false check (authority_expanded is false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(batch_keys) = batch_count),
  check (max_total_cost_usd <= batch_count * 1.825000),
  check (committed_cost_usd <= max_total_cost_usd),
  check (expires_at > authorized_at),
  check (expires_at <= authorized_at + interval '24 hours')
);

create table if not exists public.cos_university_mass_distillation_batch_runs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.cos_university_mass_distillation_campaigns(id) on delete restrict,
  batch_key text not null references public.cos_university_distillation_curriculum_batches(batch_key) on delete restrict,
  candidate_id text not null unique,
  subject_id text not null,
  student_model_id text not null,
  source_count integer not null check (source_count between 20 and 128),
  stage text not null default 'teacher_pending' check (stage in (
    'teacher_pending','teacher_dispatching','teacher_dispatched',
    'preparation_pending','preparation_dispatching','preparation_dispatched',
    'training_pending','training_dispatching','training_dispatched',
    'trained_pending_rollback','complete','failed'
  )),
  stage_reserved_cost_usd numeric(10,6) not null default 0 check (stage_reserved_cost_usd >= 0),
  stage_idempotency_key text check (stage_idempotency_key is null or stage_idempotency_key ~ '^[a-f0-9]{64}$'),
  claimed_at timestamptz,
  teacher_model_id text,
  teacher_model_revision text check (teacher_model_revision is null or teacher_model_revision ~ '^[a-f0-9]{40}$'),
  student_model_revision text check (student_model_revision is null or student_model_revision ~ '^[a-f0-9]{40}$'),
  prompt_set_hash text check (prompt_set_hash is null or prompt_set_hash ~ '^[a-f0-9]{64}$'),
  teacher_job_id text,
  teacher_job_url text,
  teacher_source_ref text,
  teacher_output_hashes text[],
  dataset_hash text check (dataset_hash is null or dataset_hash ~ '^[a-f0-9]{64}$'),
  preparation_job_id text,
  preparation_job_url text,
  training_data_ref text,
  holdout_data_ref text,
  training_manifest_hash text check (training_manifest_hash is null or training_manifest_hash ~ '^[a-f0-9]{64}$'),
  holdout_manifest_hash text check (holdout_manifest_hash is null or holdout_manifest_hash ~ '^[a-f0-9]{64}$'),
  revision_key text check (revision_key is null or revision_key ~ '^[a-f0-9]{64}$'),
  training_job_id text,
  training_job_url text,
  trained_artifact_id text,
  trained_artifact_hash text check (trained_artifact_hash is null or trained_artifact_hash ~ '^[a-f0-9]{64}$'),
  evidence_ref text,
  rollback_artifact_ref text,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (campaign_id, batch_key),
  unique (batch_key)
);

create index if not exists cos_university_mass_distillation_campaign_status_idx
  on public.cos_university_mass_distillation_campaigns(status, authorized_at desc);
create index if not exists cos_university_mass_distillation_batch_stage_idx
  on public.cos_university_mass_distillation_batch_runs(campaign_id, stage, updated_at asc);

alter table public.cos_university_mass_distillation_campaigns enable row level security;
alter table public.cos_university_mass_distillation_batch_runs enable row level security;
revoke all on table public.cos_university_mass_distillation_campaigns from public, anon, authenticated;
revoke all on table public.cos_university_mass_distillation_batch_runs from public, anon, authenticated;
grant select, insert, update on table public.cos_university_mass_distillation_campaigns to service_role;
grant select, insert, update on table public.cos_university_mass_distillation_batch_runs to service_role;

comment on table public.cos_university_mass_distillation_campaigns is
  'Owner-authorized bounded spend envelope for prepared mass-distillation batches. It never authorizes promotion or RunPod mutation.';
comment on table public.cos_university_mass_distillation_batch_runs is
  'Durable per-batch teacher -> partition -> LoRA execution state. A unique batch key prevents duplicate paid consumption.';

create or replace function public.authorize_cos_university_mass_distillation_campaign(
  p_batch_keys text[],
  p_max_total_cost_usd numeric,
  p_authorization_ref text,
  p_valid_for interval default interval '24 hours'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign_id uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_count integer;
  v_distinct_count integer;
  v_expected_max numeric(10,6);
  v_evidence jsonb;
  v_evidence_hash text;
  v_event_key text;
begin
  if p_batch_keys is null or cardinality(p_batch_keys) < 1 or cardinality(p_batch_keys) > 20 then
    raise exception 'mass_distillation_campaign_batch_count_invalid';
  end if;
  select count(*), count(distinct x) into v_count, v_distinct_count from unnest(p_batch_keys) x;
  if v_count <> v_distinct_count then
    raise exception 'mass_distillation_campaign_duplicate_batch';
  end if;
  if p_valid_for <= interval '0 seconds' or p_valid_for > interval '24 hours' then
    raise exception 'mass_distillation_campaign_validity_invalid';
  end if;
  if length(btrim(coalesce(p_authorization_ref,''))) < 8 then
    raise exception 'mass_distillation_campaign_authorization_ref_invalid';
  end if;

  select count(*) into v_count
  from public.cos_university_distillation_curriculum_batches b
  where b.batch_key = any(p_batch_keys)
    and b.status = 'prepared'
    and b.dispatch_authorized = false
    and b.authority_expanded = false
    and b.student_model_id = 'Qwen/Qwen3-4B'
    and b.source_count between 20 and 128;
  if v_count <> cardinality(p_batch_keys) then
    raise exception 'mass_distillation_campaign_batch_not_prepared';
  end if;
  if exists (
    select 1 from public.cos_university_mass_distillation_batch_runs r
    where r.batch_key = any(p_batch_keys)
  ) then
    raise exception 'mass_distillation_campaign_batch_already_consumed';
  end if;

  v_expected_max := round((cardinality(p_batch_keys)::numeric * 1.825000)::numeric, 6);
  if p_max_total_cost_usd is null or round(p_max_total_cost_usd, 6) <> v_expected_max then
    raise exception 'mass_distillation_campaign_budget_must_equal_hard_batch_ceiling';
  end if;

  insert into public.cos_university_mass_distillation_campaigns (
    id, batch_keys, batch_count, max_total_cost_usd, committed_cost_usd,
    authorization_ref, authorized_at, expires_at,
    automatic_promotion_authorized, runpod_mutation_authorized, authority_expanded
  ) values (
    v_campaign_id, p_batch_keys, cardinality(p_batch_keys), v_expected_max, 0,
    left(btrim(p_authorization_ref), 500), v_now, v_now + p_valid_for,
    false, false, false
  );

  insert into public.cos_university_mass_distillation_batch_runs (
    campaign_id, batch_key, candidate_id, subject_id, student_model_id, source_count, stage
  )
  select
    v_campaign_id,
    b.batch_key,
    'mass:' || v_campaign_id::text || ':' || left(b.batch_key, 16),
    b.subject_id,
    b.student_model_id,
    b.source_count,
    'teacher_pending'
  from public.cos_university_distillation_curriculum_batches b
  where b.batch_key = any(p_batch_keys)
  order by b.batch_key;

  v_evidence := jsonb_build_object(
    'profile','cos-university-mass-distillation-campaign-v1',
    'claim','mass_distillation_campaign_authorized',
    'campaignId',v_campaign_id,
    'batchKeys',p_batch_keys,
    'batchCount',cardinality(p_batch_keys),
    'maxTotalCostUsd',v_expected_max,
    'perBatchHardCeilingUsd',1.825000,
    'teacherHardCeilingUsd',0.200000,
    'datasetPreparationHardCeilingUsd',0.015000,
    'studentTrainingHardCeilingUsd',1.610000,
    'authorizationRef',left(btrim(p_authorization_ref),500),
    'automaticPromotionAuthorized',false,
    'runpodMutationAuthorized',false,
    'authorityExpanded',false
  );
  v_evidence_hash := encode(extensions.digest(convert_to(v_evidence::text,'UTF8'),'sha256'),'hex');
  v_event_key := encode(extensions.digest(convert_to(
    'cos-university-mass-distillation-campaign-v1:authorized:' || v_campaign_id::text,
    'UTF8'
  ),'sha256'),'hex');
  insert into public.cos_university_learning_assurance_events (
    event_key,event_type,candidate_id,evidence_hash,evidence,verifier,observed_at,expires_at
  ) values (
    v_event_key,'fine_tune','mass-campaign:' || v_campaign_id::text,
    v_evidence_hash,v_evidence,'host_controller',v_now,v_now + p_valid_for
  );

  return v_campaign_id;
end;
$$;

revoke all on function public.authorize_cos_university_mass_distillation_campaign(text[],numeric,text,interval)
  from public, anon, authenticated;
grant execute on function public.authorize_cos_university_mass_distillation_campaign(text[],numeric,text,interval)
  to service_role;

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
  select * into v_campaign
  from public.cos_university_mass_distillation_campaigns
  where id = p_campaign_id
  for update;
  if not found then raise exception 'mass_distillation_campaign_missing'; end if;
  if v_campaign.status not in ('authorized','active') then return; end if;
  if v_campaign.expires_at <= clock_timestamp() then
    update public.cos_university_mass_distillation_campaigns
      set status='expired', updated_at=clock_timestamp()
      where id=p_campaign_id;
    return;
  end if;

  select * into v_run
  from public.cos_university_mass_distillation_batch_runs
  where campaign_id = p_campaign_id
    and stage in ('teacher_pending','preparation_pending','training_pending')
  order by batch_key
  for update skip locked
  limit 1;

  if not found then
    if not exists (
      select 1 from public.cos_university_mass_distillation_batch_runs
      where campaign_id=p_campaign_id and stage <> 'complete'
    ) then
      update public.cos_university_mass_distillation_campaigns
      set status='completed', completed_at=coalesce(completed_at,clock_timestamp()), updated_at=clock_timestamp()
      where id=p_campaign_id;
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

  update public.cos_university_mass_distillation_campaigns
    set status='active', committed_cost_usd=committed_cost_usd+v_ceiling, updated_at=clock_timestamp()
    where id=p_campaign_id;
  update public.cos_university_mass_distillation_batch_runs
    set stage=v_new_stage, stage_reserved_cost_usd=v_ceiling, claimed_at=clock_timestamp(), updated_at=clock_timestamp()
    where id=v_run.id;

  return query select
    v_run.id, v_run.campaign_id, v_run.batch_key, v_run.candidate_id,
    v_run.subject_id, v_run.student_model_id, v_new_stage, v_ceiling;
end;
$$;

revoke all on function public.claim_cos_university_mass_distillation_stage(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_cos_university_mass_distillation_stage(uuid)
  to service_role;
