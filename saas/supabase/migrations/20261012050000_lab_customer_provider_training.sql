-- saas/supabase/migrations/20261012050000_lab_customer_provider_training.sql
-- Customer LAB: training on the customer's own Together AI or Fireworks AI account, beside Hugging Face Jobs.
--   * Same isolation as 20261012000000: no table grants, SECURITY DEFINER functions only, customer JWT only.
--   * Same spend order: the run's maximum cost is reserved (committed_max_cost_usd) BEFORE the paid job is created.
--   * Fireworks prices come only from lab.training_rate_cards (provider-published LoRA SFT bands, platform-maintained).
--     Together prices come from Together's own estimate-price API at start time, so it needs no card.
--   * Read-only helpers for the LAB dropdowns: priced teacher models, training price bands, credential endpoint.
-- Additive and idempotent. Depends on 20261012000000 .. 20261012040000. No begin/commit (safe in the Hub SQL runner).

-- 1. Runs: allow the new compute providers and record their job ----------------------------------------------------
alter table lab.customer_training_runs drop constraint if exists customer_training_runs_compute_provider_kind_check;
alter table lab.customer_training_runs add constraint customer_training_runs_compute_provider_kind_check
  check (compute_provider_kind in ('huggingface','together','fireworks'));
alter table lab.customer_training_runs drop constraint if exists customer_training_runs_base_model_check;
alter table lab.customer_training_runs add constraint customer_training_runs_base_model_check
  check (base_model ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' or base_model ~ '^accounts/[a-z0-9-]+/models/[A-Za-z0-9_.-]+$');
-- The hourly GPU cap only applies to Hugging Face Jobs; token-billed providers have no hourly price.
alter table lab.customer_training_runs alter column max_hourly_usd drop not null;
alter table lab.customer_training_runs drop constraint if exists customer_training_runs_hourly_required_ck;
alter table lab.customer_training_runs add constraint customer_training_runs_hourly_required_ck
  check (compute_provider_kind <> 'huggingface' or max_hourly_usd is not null);
alter table lab.customer_training_runs
  add column if not exists provider_account text check (provider_account is null or provider_account ~ '^accounts/[a-z0-9-]+$'),
  add column if not exists provider_file_ref text check (provider_file_ref is null or length(provider_file_ref) <= 240),
  add column if not exists provider_job_id text check (provider_job_id is null or length(provider_job_id) <= 240),
  add column if not exists provider_job_url text check (provider_job_url is null or provider_job_url ~ '^https://'),
  add column if not exists tuned_model_id text check (tuned_model_id is null or length(tuned_model_id) <= 240),
  add column if not exists provider_reported_cost_usd numeric(12,6) check (provider_reported_cost_usd is null or provider_reported_cost_usd >= 0);

-- 2. Training price bands (Fireworks LoRA SFT, USD per 1M training tokens) ------------------------------------------
create table if not exists lab.training_rate_cards (
  id uuid primary key default gen_random_uuid(),
  provider_kind text not null check (provider_kind in ('fireworks')),
  training_method text not null check (training_method = 'lora_sft'),
  min_parameters bigint not null check (min_parameters >= 0),
  max_parameters bigint check (max_parameters is null or max_parameters >= min_parameters),
  usd_per_mtok numeric(12,6) not null check (usd_per_mtok > 0 and usd_per_mtok <= 1000),
  safety_margin numeric(4,2) not null default 1.25 check (safety_margin >= 1 and safety_margin <= 3),
  source_url text not null check (source_url ~ '^https://'),
  verified_by text not null check (length(btrim(verified_by)) between 1 and 120),
  verified_at timestamptz not null,
  effective_from timestamptz not null default now(),
  effective_until timestamptz,
  created_at timestamptz not null default now(),
  check (effective_until is null or effective_until > effective_from)
);
create unique index if not exists lab_training_rate_cards_open_uidx
  on lab.training_rate_cards(provider_kind, training_method, min_parameters) where effective_until is null;
alter table lab.training_rate_cards enable row level security;
revoke all on lab.training_rate_cards from public, anon, authenticated, service_role;

-- Published on https://fireworks.ai/pricing (Managed Training, LoRA SFT), read 2026-10-12.
insert into lab.training_rate_cards(provider_kind, training_method, min_parameters, max_parameters, usd_per_mtok, source_url, verified_by, verified_at)
select v.provider_kind, 'lora_sft', v.min_p, v.max_p, v.usd, 'https://fireworks.ai/pricing', 'fireworks.ai/pricing read 2026-10-12', '2026-10-12T00:00:00Z'
from (values ('fireworks', 0::bigint, 16000000000::bigint, 0.50::numeric),
             ('fireworks', 16000000001, 80000000000, 3.00),
             ('fireworks', 80000000001, 300000000000, 6.00),
             ('fireworks', 300000000001, null, 10.00)) as v(provider_kind, min_p, max_p, usd)
where not exists (select 1 from lab.training_rate_cards c
  where c.provider_kind = v.provider_kind and c.training_method = 'lora_sft' and c.min_parameters = v.min_p and c.effective_until is null);

create or replace function public.itmounts_lab_customer_training_rate_cards(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'providerKind', provider_kind, 'minParameters', min_parameters,
      'maxParameters', max_parameters, 'usdPerMTok', usd_per_mtok, 'safetyMargin', safety_margin) order by provider_kind, min_parameters)
    from lab.training_rate_cards where effective_until is null and effective_from <= now()), '[]'::jsonb);
end $$;

-- 3. Teacher models that have an active verified price (the teacher dropdown only enables these) -------------------
create or replace function public.itmounts_lab_customer_priced_teacher_models(p_organization_id uuid, p_provider_kind text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  return coalesce((select jsonb_agg(model order by model) from lab.teacher_rate_cards
    where provider_kind = p_provider_kind and effective_until is null and effective_from <= now()), '[]'::jsonb);
end $$;

-- 4. Model discovery also needs the custom endpoint (openai_compatible lists models at its own /models) -----------
create or replace function public.itmounts_lab_customer_open_model_directory_credential(
  p_organization_id uuid, p_credential_id uuid
) returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare c lab.provider_credentials%rowtype;
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_credential_forbidden';
  end if;
  select * into c from lab.provider_credentials
    where id = p_credential_id and organization_id = p_organization_id and revoked_at is null;
  if not found then raise exception 'lab_credential_unavailable'; end if;
  return jsonb_build_object('id', c.id, 'providerKind', c.provider_kind, 'endpoint', c.endpoint,
    'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag);
end $$;

-- 5. Run creation accepts the new compute providers -----------------------------------------------------------------
create or replace function public.itmounts_lab_customer_create_training_run(
  p_organization_id uuid, p_experiment_id uuid, p_teacher_credential_id uuid, p_teacher_model text,
  p_compute_credential_id uuid, p_base_model text, p_base_model_revision text,
  p_approved_budget_usd numeric, p_max_hourly_usd numeric
) returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare t lab.provider_credentials%rowtype;
declare c lab.provider_credentials%rowtype;
declare run_id uuid;
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_training_forbidden';
  end if;
  perform 1 from lab.experiments where id = p_experiment_id and organization_id = p_organization_id;
  if not found then raise exception 'lab_customer_experiment_not_found'; end if;
  select * into t from lab.provider_credentials
    where id = p_teacher_credential_id and organization_id = p_organization_id and revoked_at is null;
  if not found then raise exception 'lab_customer_teacher_credential_unavailable'; end if;
  select * into c from lab.provider_credentials
    where id = p_compute_credential_id and organization_id = p_organization_id and revoked_at is null;
  if not found or c.provider_kind not in ('huggingface','together','fireworks') then
    raise exception 'lab_customer_compute_credential_unavailable';
  end if;
  insert into lab.customer_training_runs(organization_id, experiment_id, requested_by, teacher_credential_id,
    teacher_provider_kind, teacher_model, compute_credential_id, compute_provider_kind, base_model, base_model_revision,
    approved_budget_usd, max_hourly_usd)
  values (p_organization_id, p_experiment_id, uid, t.id, t.provider_kind, btrim(p_teacher_model), c.id, c.provider_kind,
    p_base_model, nullif(p_base_model_revision, ''), p_approved_budget_usd,
    case when c.provider_kind = 'huggingface' then p_max_hourly_usd else null end)
  returning id into run_id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (run_id, p_organization_id, 'credentials_released', jsonb_build_object('to','customer_request','user',uid), 'customer');
  return jsonb_build_object('runId', run_id,
    'teacher', jsonb_build_object('id', t.id, 'providerKind', t.provider_kind, 'endpoint', t.endpoint,
      'ciphertext', t.ciphertext, 'iv', t.iv, 'tag', t.tag),
    'compute', jsonb_build_object('id', c.id, 'providerKind', c.provider_kind,
      'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag));
end $$;

-- 6. Stage writes accept the provider job fields ---------------------------------------------------------------------
create or replace function lab.apply_customer_run_stage(
  p_run_id uuid, p_org uuid, p_stage text, p_progress int, p_message text, p_patch jsonb,
  p_add_cost numeric, p_next_token_hash text, p_actor text
) returns void language plpgsql security definer set search_path = pg_catalog, lab as $$
declare r lab.customer_training_runs%rowtype;
begin
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_org for update;
  if not found then raise exception 'lab_customer_run_not_found'; end if;
  if r.stage in ('completed','failed','cancelled') then raise exception 'lab_customer_run_terminal'; end if;
  if p_stage not in ('generating_teacher_data','preparing_dataset','training','completed','failed') then
    raise exception 'lab_customer_stage_invalid';
  end if;
  if r.spend_blocked_at is not null and coalesce(p_add_cost, 0) > 0 then raise exception 'lab_customer_spend_blocked'; end if;
  if r.committed_max_cost_usd + coalesce(p_add_cost, 0) > r.approved_budget_usd then
    raise exception 'lab_customer_budget_exceeded';
  end if;
  update lab.customer_training_runs set
    stage = p_stage,
    progress_percent = greatest(0, least(100, coalesce(p_progress, progress_percent))),
    status_message = left(p_message, 300),
    committed_max_cost_usd = committed_max_cost_usd + coalesce(p_add_cost, 0),
    dataset_hash = coalesce(p_patch->>'datasetHash', dataset_hash),
    teacher_rows = coalesce((p_patch->>'teacherRows')::int, teacher_rows),
    training_data_ref = coalesce(p_patch->>'trainingDataRef', training_data_ref),
    holdout_data_ref = coalesce(p_patch->>'holdoutDataRef', holdout_data_ref),
    training_manifest_hash = coalesce(p_patch->>'trainingManifestHash', training_manifest_hash),
    holdout_manifest_hash = coalesce(p_patch->>'holdoutManifestHash', holdout_manifest_hash),
    hf_namespace = coalesce(p_patch->>'hfNamespace', hf_namespace),
    hf_job_id = coalesce(p_patch->>'hfJobId', hf_job_id),
    hf_job_url = coalesce(p_patch->>'hfJobUrl', hf_job_url),
    hf_pending_job_name = coalesce(p_patch->>'hfPendingJobName', hf_pending_job_name),
    provider_account = coalesce(p_patch->>'providerAccount', provider_account),
    provider_file_ref = coalesce(p_patch->>'providerFileRef', provider_file_ref),
    provider_job_id = coalesce(p_patch->>'providerJobId', provider_job_id),
    provider_job_url = coalesce(p_patch->>'providerJobUrl', provider_job_url),
    tuned_model_id = coalesce(p_patch->>'tunedModelId', tuned_model_id),
    provider_reported_cost_usd = coalesce((p_patch->>'providerReportedCostUsd')::numeric, provider_reported_cost_usd),
    job_submission_state = coalesce(p_patch->>'jobSubmissionState', job_submission_state),
    pending_job_cost_usd = case when p_patch ? 'hfPendingJobName' or p_patch->>'jobSubmissionState' = 'reserved' then coalesce(p_add_cost, 0)
                                when p_patch->>'jobSubmissionState' = 'submitted' then 0 else pending_job_cost_usd end,
    artifact_files = coalesce(p_patch->'artifactFiles', artifact_files),
    artifact_repo = coalesce(p_patch->>'artifactRepo', artifact_repo),
    artifact_revision = coalesce(p_patch->>'artifactRevision', artifact_revision),
    artifact_hash = coalesce(p_patch->>'artifactHash', artifact_hash),
    failure_code = coalesce(left(p_patch->>'failureCode', 120), failure_code),
    -- 'keep' leaves the live callback token untouched (status refreshes must not cut off a running job).
    stage_token_hash = case when p_next_token_hash = 'keep' then stage_token_hash else p_next_token_hash end,
    stage_token_expires_at = case when p_next_token_hash = 'keep' then stage_token_expires_at
                                  when p_next_token_hash is null then null else now() + interval '2 days' end,
    updated_at = now()
  where id = p_run_id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (p_run_id, p_org, 'stage:' || p_stage, coalesce(p_patch, '{}'::jsonb) - 'failureDetail', p_actor);
end $$;
revoke all on function lab.apply_customer_run_stage(uuid,uuid,text,int,text,jsonb,numeric,text,text) from public, anon, authenticated, service_role;

-- 7. Refresh and list expose the provider job ------------------------------------------------------------------------
create or replace function public.itmounts_lab_customer_open_run_compute(p_organization_id uuid, p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare r lab.customer_training_runs%rowtype;
declare c lab.provider_credentials%rowtype;
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_training_forbidden';
  end if;
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_organization_id;
  if not found then raise exception 'lab_customer_run_not_found'; end if;
  select * into c from lab.provider_credentials
    where id = r.compute_credential_id and organization_id = p_organization_id and revoked_at is null;
  if not found then raise exception 'lab_customer_compute_credential_unavailable'; end if;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (r.id, p_organization_id, 'credentials_released', jsonb_build_object('to','customer_refresh','user',uid), 'customer');
  return jsonb_build_object('runId', r.id, 'organizationId', r.organization_id, 'stage', r.stage,
    'progressPercent', r.progress_percent, 'computeProviderKind', r.compute_provider_kind,
    'hfNamespace', r.hf_namespace, 'hfJobId', r.hf_job_id, 'hfPendingJobName', r.hf_pending_job_name,
    'providerAccount', r.provider_account, 'providerJobId', r.provider_job_id,
    'jobSubmissionState', r.job_submission_state,
    'compute', jsonb_build_object('id', c.id, 'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag));
end $$;

create or replace function public.itmounts_lab_customer_list_training_runs(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'runId', id, 'experimentId', experiment_id, 'stage', stage, 'progressPercent', progress_percent,
      'statusMessage', status_message, 'teacherProviderKind', teacher_provider_kind, 'teacherModel', teacher_model,
      'computeProviderKind', compute_provider_kind,
      'baseModel', base_model, 'approvedBudgetUsd', approved_budget_usd, 'committedMaxCostUsd', committed_max_cost_usd,
      'teacherReservedUsd', teacher_reserved_usd, 'teacherSpentUsd', teacher_spent_usd, 'teacherOverrunUsd', teacher_overrun_usd,
      'teacherReservationState', teacher_reservation_state, 'spendBlocked', spend_blocked_at is not null,
      'hfJobUrl', hf_job_url, 'providerJobUrl', provider_job_url, 'tunedModelId', tuned_model_id,
      'providerReportedCostUsd', provider_reported_cost_usd,
      'artifactRepo', artifact_repo, 'artifactRevision', artifact_revision,
      'artifactHash', artifact_hash, 'failureCode', failure_code, 'createdAt', created_at, 'updatedAt', updated_at)
      order by created_at desc)
    from lab.customer_training_runs where organization_id = p_organization_id), '[]'::jsonb);
end $$;

-- 8. Grants ----------------------------------------------------------------------------------------------------------
revoke all on function public.itmounts_lab_customer_training_rate_cards(uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_priced_teacher_models(uuid,text) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_open_model_directory_credential(uuid,uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_create_training_run(uuid,uuid,uuid,text,uuid,text,text,numeric,numeric) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_open_run_compute(uuid,uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_list_training_runs(uuid) from public, anon, service_role;
grant execute on function public.itmounts_lab_customer_training_rate_cards(uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_priced_teacher_models(uuid,text) to authenticated;
grant execute on function public.itmounts_lab_customer_open_model_directory_credential(uuid,uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_create_training_run(uuid,uuid,uuid,text,uuid,text,text,numeric,numeric) to authenticated;
grant execute on function public.itmounts_lab_customer_open_run_compute(uuid,uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_list_training_runs(uuid) to authenticated;
notify pgrst, 'reload schema';
