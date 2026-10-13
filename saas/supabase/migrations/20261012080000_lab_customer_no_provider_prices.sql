-- saas/supabase/migrations/20261012080000_lab_customer_no_provider_prices.sql
-- Customer LAB: the platform no longer prices, budgets or reserves the customer's provider spend.
-- Owner decision 2026-10-12: what a provider charges is between the customer and that provider, on the customer's own
-- key; the platform only cares about its own price. So this removes:
--   * teacher and training price lists (lab.teacher_rate_cards, lab.training_rate_cards) and every function using them,
--     including the OpenRouter price sync;
--   * the run's budget / hourly cap / reservation / settlement columns and the checks built on them.
-- Kept: the deterministic job-name bookkeeping (a paid job's name is saved BEFORE it is submitted, so a job whose
-- creation response was lost is still found and attached), stage tokens, cancellation and every isolation rule
-- (no table grants, SECURITY DEFINER functions only, customer JWT / service role exactly as before).
-- Idempotent. No begin/commit (safe in the Hub SQL runner).

-- 1. Retire the price functions -----------------------------------------------------------------------------------
drop function if exists public.itmounts_lab_platform_sync_teacher_rate_cards(text, text, jsonb);
drop function if exists public.itmounts_lab_customer_priced_teacher_models(uuid, text);
drop function if exists public.itmounts_lab_customer_training_rate_cards(uuid);
drop function if exists public.itmounts_lab_customer_teacher_rate_card(uuid, uuid);
drop function if exists public.itmounts_lab_customer_reserve_teacher(uuid, uuid, uuid, bigint, bigint, numeric);
drop function if exists public.itmounts_lab_customer_settle_teacher(uuid, uuid, bigint, bigint, jsonb);
drop function if exists lab.active_teacher_rate_card(text, text);

-- Old signatures that carried budgets or committed costs (replaced below).
drop function if exists public.itmounts_lab_customer_create_training_run(uuid, uuid, uuid, text, uuid, text, text, numeric, numeric);
drop function if exists public.itmounts_lab_customer_record_stage(uuid, uuid, text, int, text, jsonb, numeric, text);
drop function if exists public.itmounts_lab_worker_record_stage(uuid, uuid, text, text, int, text, jsonb, numeric, text);
drop function if exists lab.apply_customer_run_stage(uuid, uuid, text, int, text, jsonb, numeric, text, text);

-- 2. Retire the price columns and tables ---------------------------------------------------------------------------
alter table lab.customer_training_runs drop constraint if exists customer_training_runs_budget_ck;
alter table lab.customer_training_runs drop constraint if exists customer_training_runs_hourly_required_ck;
alter table lab.customer_training_runs
  drop column if exists approved_budget_usd,
  drop column if exists max_hourly_usd,
  drop column if exists committed_max_cost_usd,
  drop column if exists pending_job_cost_usd,
  drop column if exists spend_blocked_at,
  drop column if exists spend_blocked_reason,
  drop column if exists teacher_rate_card_id,
  drop column if exists teacher_input_token_bound,
  drop column if exists teacher_output_token_bound,
  drop column if exists teacher_input_tokens,
  drop column if exists teacher_output_tokens,
  drop column if exists teacher_reserved_usd,
  drop column if exists teacher_spent_usd,
  drop column if exists teacher_overrun_usd,
  drop column if exists teacher_reservation_state,
  drop column if exists provider_reported_cost_usd;
drop table if exists lab.teacher_rate_cards;
drop table if exists lab.training_rate_cards;

-- 3. Run creation: credentials, models and the provider; no money ---------------------------------------------------
create or replace function public.itmounts_lab_customer_create_training_run(
  p_organization_id uuid, p_experiment_id uuid, p_teacher_credential_id uuid, p_teacher_model text,
  p_compute_credential_id uuid, p_base_model text, p_base_model_revision text
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
    teacher_provider_kind, teacher_model, compute_credential_id, compute_provider_kind, base_model, base_model_revision)
  values (p_organization_id, p_experiment_id, uid, t.id, t.provider_kind, btrim(p_teacher_model), c.id, c.provider_kind,
    p_base_model, nullif(p_base_model_revision, ''))
  returning id into run_id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (run_id, p_organization_id, 'credentials_released', jsonb_build_object('to','customer_request','user',uid), 'customer');
  return jsonb_build_object('runId', run_id,
    'teacher', jsonb_build_object('id', t.id, 'providerKind', t.provider_kind, 'endpoint', t.endpoint,
      'ciphertext', t.ciphertext, 'iv', t.iv, 'tag', t.tag),
    'compute', jsonb_build_object('id', c.id, 'providerKind', c.provider_kind,
      'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag));
end $$;

-- 4. Stage writes ----------------------------------------------------------------------------------------------------
create or replace function lab.apply_customer_run_stage(
  p_run_id uuid, p_org uuid, p_stage text, p_progress int, p_message text, p_patch jsonb,
  p_next_token_hash text, p_actor text
) returns void language plpgsql security definer set search_path = pg_catalog, lab as $$
declare r lab.customer_training_runs%rowtype;
begin
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_org for update;
  if not found then raise exception 'lab_customer_run_not_found'; end if;
  if r.stage in ('completed','failed','cancelled') then raise exception 'lab_customer_run_terminal'; end if;
  -- 'cancelled' is recorded only after the provider itself confirmed the job stopped (customer cancel).
  if p_stage not in ('generating_teacher_data','preparing_dataset','training','completed','failed','cancelled') then
    raise exception 'lab_customer_stage_invalid';
  end if;
  update lab.customer_training_runs set
    stage = p_stage,
    progress_percent = greatest(0, least(100, coalesce(p_progress, progress_percent))),
    status_message = left(p_message, 300),
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
    job_submission_state = coalesce(p_patch->>'jobSubmissionState', job_submission_state),
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
revoke all on function lab.apply_customer_run_stage(uuid,uuid,text,int,text,jsonb,text,text) from public, anon, authenticated, service_role;

create or replace function public.itmounts_lab_customer_record_stage(
  p_organization_id uuid, p_run_id uuid, p_stage text, p_progress int, p_message text, p_patch jsonb,
  p_next_stage_token_hash text
) returns boolean language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_training_forbidden';
  end if;
  perform lab.apply_customer_run_stage(p_run_id, p_organization_id, p_stage, p_progress, p_message, p_patch,
    p_next_stage_token_hash, 'customer');
  return true;
end $$;

create or replace function public.itmounts_lab_worker_record_stage(
  p_run_id uuid, p_organization_id uuid, p_expected_stage text, p_stage text, p_progress int, p_message text,
  p_patch jsonb, p_next_stage_token_hash text
) returns boolean language plpgsql security definer set search_path = pg_catalog, lab as $$
declare current_stage text;
begin
  select stage into current_stage from lab.customer_training_runs
    where id = p_run_id and organization_id = p_organization_id
      and (stage_token_hash is null or job_submission_state = 'reserved');
  if not found or current_stage <> p_expected_stage then raise exception 'lab_worker_stage_conflict'; end if;
  perform lab.apply_customer_run_stage(p_run_id, p_organization_id, p_stage, p_progress, p_message, p_patch,
    p_next_stage_token_hash, 'worker_callback');
  return true;
end $$;

-- 5. A job whose creation is proven absent: mark it not created (no money to give back any more) -------------------
create or replace function lab.release_customer_job_reservation(p_run_id uuid, p_org uuid, p_reason text, p_actor text)
returns void language plpgsql security definer set search_path = pg_catalog, lab as $$
declare r lab.customer_training_runs%rowtype;
begin
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_org for update;
  if not found or r.job_submission_state is distinct from 'reserved' then raise exception 'lab_customer_no_open_reservation'; end if;
  update lab.customer_training_runs set
    job_submission_state = 'released', stage = 'failed',
    failure_code = left(p_reason, 120), status_message = left('Job was not created: ' || p_reason, 300),
    stage_token_hash = null, stage_token_expires_at = null, updated_at = now()
  where id = p_run_id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (p_run_id, p_org, 'job_not_created', jsonb_build_object('reason', p_reason), p_actor);
end $$;
revoke all on function lab.release_customer_job_reservation(uuid,uuid,text,text) from public, anon, authenticated, service_role;

-- 6. Worker token redemption and the run list, without money fields ------------------------------------------------
create or replace function public.itmounts_lab_worker_redeem_stage_token(p_token_hash text)
returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare r lab.customer_training_runs%rowtype;
declare c lab.provider_credentials%rowtype;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then raise exception 'lab_worker_token_invalid'; end if;
  select * into r from lab.customer_training_runs
    where stage_token_hash = p_token_hash and stage_token_expires_at > now()
      and stage not in ('completed','failed','cancelled')
    for update;
  if not found then return null; end if;
  select * into c from lab.provider_credentials
    where id = r.compute_credential_id and organization_id = r.organization_id and revoked_at is null;
  update lab.customer_training_runs set stage_token_hash = null, stage_token_expires_at = null, updated_at = now()
    where id = r.id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (r.id, r.organization_id, 'credentials_released', jsonb_build_object('to','worker_callback'), 'worker_callback');
  return jsonb_build_object('runId', r.id, 'organizationId', r.organization_id, 'stage', r.stage,
    'baseModel', r.base_model, 'baseModelRevision', r.base_model_revision, 'datasetHash', r.dataset_hash,
    'trainingMode', r.training_mode, 'hfNamespace', r.hf_namespace, 'hfJobId', r.hf_job_id,
    'hfPendingJobName', r.hf_pending_job_name, 'jobSubmissionState', r.job_submission_state,
    'compute', case when c.id is null then null else
      jsonb_build_object('id', c.id, 'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag) end);
end $$;

create or replace function public.itmounts_lab_customer_list_training_runs(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'runId', id, 'experimentId', experiment_id, 'stage', stage, 'progressPercent', progress_percent,
      'statusMessage', status_message, 'teacherProviderKind', teacher_provider_kind, 'teacherModel', teacher_model,
      'computeProviderKind', compute_provider_kind, 'baseModel', base_model,
      'hfJobUrl', hf_job_url, 'providerJobUrl', provider_job_url, 'tunedModelId', tuned_model_id,
      'artifactRepo', artifact_repo, 'artifactRevision', artifact_revision,
      'artifactHash', artifact_hash, 'failureCode', failure_code, 'createdAt', created_at, 'updatedAt', updated_at)
      order by created_at desc)
    from lab.customer_training_runs where organization_id = p_organization_id), '[]'::jsonb);
end $$;

-- 7. Grants (same audiences as before) -------------------------------------------------------------------------------
revoke all on function public.itmounts_lab_customer_create_training_run(uuid,uuid,uuid,text,uuid,text,text) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_record_stage(uuid,uuid,text,int,text,jsonb,text) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_list_training_runs(uuid) from public, anon, service_role;
grant execute on function public.itmounts_lab_customer_create_training_run(uuid,uuid,uuid,text,uuid,text,text) to authenticated;
grant execute on function public.itmounts_lab_customer_record_stage(uuid,uuid,text,int,text,jsonb,text) to authenticated;
grant execute on function public.itmounts_lab_customer_list_training_runs(uuid) to authenticated;
revoke all on function public.itmounts_lab_worker_redeem_stage_token(text) from public, anon, authenticated;
revoke all on function public.itmounts_lab_worker_record_stage(uuid,uuid,text,text,int,text,jsonb,text) from public, anon, authenticated;
grant execute on function public.itmounts_lab_worker_redeem_stage_token(text) to service_role;
grant execute on function public.itmounts_lab_worker_record_stage(uuid,uuid,text,text,int,text,jsonb,text) to service_role;
notify pgrst, 'reload schema';
