-- Customer LAB: customer-owned provider credentials, customer training runs and their progress.
--
-- Isolation model
--  * Credentials are AES-256-GCM ciphertext produced by the app (lib/vault/crypto.ts master key, per-organization
--    derived key, organization+credential bound AAD). The database never sees a plaintext key.
--  * No role (anon, authenticated, service_role) can read the tables directly. Every access goes through the
--    SECURITY DEFINER functions below.
--  * Customer actions (store/list/revoke a key, start a run, refresh a run) are only callable with the signed-in
--    customer's own JWT: they use auth.uid() and refuse service_role. The Supervisor runs with the service role and
--    has no user session, so it cannot store, list, start, or decrypt anything here.
--  * Ciphertext is released only to an explicitly authorized execution of ONE run:
--      - in the customer's own request (start / refresh), through auth.uid() + owner/admin membership, or
--      - from that run's Hugging Face worker callback, with a single-use stage token whose hash is stored here.
--        The raw token lives only inside the customer's own Hugging Face job.
--  * Graduation, Residency or certification are never inputs to anything in this file.

-- 1. Credentials -------------------------------------------------------------------------------------------------
create table if not exists lab.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references lab.organizations(id) on delete cascade,
  provider_kind text not null check (provider_kind in ('huggingface','openai','anthropic','gemini','openai_compatible')),
  label text not null check (length(btrim(label)) between 1 and 80),
  endpoint text check (endpoint is null or (endpoint ~ '^https://[^/@\s]+(/[^\s#]*)?$' and length(endpoint) <= 500)),
  ciphertext text not null check (length(ciphertext) between 16 and 20000),
  iv text not null check (length(iv) between 8 and 64),
  tag text not null check (length(tag) between 8 and 64),
  key_version text not null default 'lab-org-v1' check (key_version = 'lab-org-v1'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (id, organization_id)
);
alter table lab.provider_credentials enable row level security;
revoke all on lab.provider_credentials from public, anon, authenticated, service_role;
create index if not exists lab_provider_credentials_org_idx on lab.provider_credentials(organization_id) where revoked_at is null;

-- 2. Training runs ------------------------------------------------------------------------------------------------
create table if not exists lab.customer_training_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references lab.organizations(id) on delete cascade,
  experiment_id uuid not null,
  requested_by uuid not null references auth.users(id),
  teacher_credential_id uuid not null,
  teacher_provider_kind text not null,
  teacher_model text not null check (length(btrim(teacher_model)) between 1 and 240),
  compute_credential_id uuid not null,
  compute_provider_kind text not null check (compute_provider_kind = 'huggingface'),
  base_model text not null check (base_model ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  base_model_revision text check (base_model_revision is null or base_model_revision ~ '^[a-f0-9]{40}$'),
  training_mode text not null default 'fine_tune' check (training_mode = 'fine_tune'),
  approved_budget_usd numeric(10,2) not null check (approved_budget_usd > 0 and approved_budget_usd <= 1000),
  max_hourly_usd numeric(10,4) not null check (max_hourly_usd > 0 and max_hourly_usd <= 1),
  committed_max_cost_usd numeric(12,6) not null default 0 check (committed_max_cost_usd >= 0),
  stage text not null default 'authorized' check (stage in
    ('authorized','generating_teacher_data','preparing_dataset','training','completed','failed','cancelled')),
  progress_percent int not null default 0 check (progress_percent between 0 and 100),
  status_message text,
  dataset_hash text check (dataset_hash is null or dataset_hash ~ '^[a-f0-9]{64}$'),
  teacher_rows int,
  training_data_ref text,
  holdout_data_ref text,
  training_manifest_hash text,
  holdout_manifest_hash text,
  hf_namespace text,
  hf_job_id text,
  hf_job_url text,
  -- Paid-job bookkeeping: the reservation, callback token and deterministic job name are saved BEFORE submission.
  hf_pending_job_name text,
  job_submission_state text check (job_submission_state is null or job_submission_state in ('reserved','submitted','released')),
  pending_job_cost_usd numeric(12,6) not null default 0 check (pending_job_cost_usd >= 0),
  artifact_files jsonb,
  artifact_repo text,
  artifact_revision text,
  artifact_hash text check (artifact_hash is null or artifact_hash ~ '^[a-f0-9]{64}$'),
  failure_code text,
  stage_token_hash text check (stage_token_hash is null or stage_token_hash ~ '^[a-f0-9]{64}$'),
  stage_token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (experiment_id, organization_id) references lab.experiments(id, organization_id),
  foreign key (teacher_credential_id, organization_id) references lab.provider_credentials(id, organization_id),
  foreign key (compute_credential_id, organization_id) references lab.provider_credentials(id, organization_id),
  -- Set when actual spend exceeded a reservation. Committed cost then records the TRUE amount (it may exceed the approved
  -- budget) and every further reservation on the run is refused.
  spend_blocked_at timestamptz,
  spend_blocked_reason text,
  constraint customer_training_runs_budget_ck check (committed_max_cost_usd <= approved_budget_usd or spend_blocked_at is not null)
);
alter table lab.customer_training_runs enable row level security;
revoke all on lab.customer_training_runs from public, anon, authenticated, service_role;
create index if not exists lab_customer_training_runs_org_idx on lab.customer_training_runs(organization_id, created_at desc);

create table if not exists lab.customer_training_events (
  id bigserial primary key,
  run_id uuid not null references lab.customer_training_runs(id) on delete cascade,
  organization_id uuid not null,
  event text not null check (length(event) between 1 and 80),
  detail jsonb not null default '{}'::jsonb,
  actor text not null check (actor in ('customer','worker_callback')),
  created_at timestamptz not null default now()
);
alter table lab.customer_training_events enable row level security;
revoke all on lab.customer_training_events from public, anon, authenticated, service_role;
create or replace function lab.prevent_customer_training_event_mutation() returns trigger language plpgsql as $$
begin raise exception 'lab_customer_training_events_append_only'; end $$;
drop trigger if exists customer_training_events_append_only on lab.customer_training_events;
create trigger customer_training_events_append_only before update or delete on lab.customer_training_events
for each row execute function lab.prevent_customer_training_event_mutation();

-- 3. Customer-session guard ---------------------------------------------------------------------------------------
-- Returns the signed-in customer's id. Refuses service_role and anonymous callers.
create or replace function lab.customer_session_user() returns uuid
language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := auth.uid();
declare jwt_role text := coalesce(current_setting('request.jwt.claims', true)::jsonb->>'role', '');
begin
  if uid is null or jwt_role <> 'authenticated' then raise exception 'lab_customer_session_required'; end if;
  return uid;
end $$;
revoke all on function lab.customer_session_user() from public, anon, authenticated, service_role;

create or replace function lab.customer_member_role(p_user uuid, p_org uuid) returns text
language sql stable security definer set search_path = pg_catalog, lab as $$
  select role from lab.organization_members where user_id = p_user and organization_id = p_org and status = 'active'
$$;
revoke all on function lab.customer_member_role(uuid, uuid) from public, anon, authenticated, service_role;

-- 4. Customer-callable functions (authenticated JWT only) ----------------------------------------------------------
create or replace function public.itmounts_lab_customer_store_credential(
  p_organization_id uuid, p_credential_id uuid, p_provider_kind text, p_label text, p_endpoint text,
  p_ciphertext text, p_iv text, p_tag text
) returns uuid language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_credential_forbidden';
  end if;
  if p_provider_kind = 'openai_compatible' and p_endpoint is null then raise exception 'lab_customer_endpoint_required'; end if;
  if p_provider_kind <> 'openai_compatible' and p_endpoint is not null then raise exception 'lab_customer_endpoint_not_allowed'; end if;
  insert into lab.provider_credentials(id, organization_id, provider_kind, label, endpoint, ciphertext, iv, tag, created_by)
  values (p_credential_id, p_organization_id, p_provider_kind, btrim(p_label), p_endpoint, p_ciphertext, p_iv, p_tag, uid);
  return p_credential_id;
end $$;

create or replace function public.itmounts_lab_customer_list_credentials(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_credential_forbidden'; end if;
  -- Metadata only. Never ciphertext, never any part of the key.
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', id, 'providerKind', provider_kind, 'label', label, 'endpoint', endpoint, 'createdAt', created_at)
      order by created_at desc)
    from lab.provider_credentials where organization_id = p_organization_id and revoked_at is null), '[]'::jsonb);
end $$;

create or replace function public.itmounts_lab_customer_revoke_credential(p_organization_id uuid, p_credential_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_credential_forbidden';
  end if;
  update lab.provider_credentials set revoked_at = now()
  where id = p_credential_id and organization_id = p_organization_id and revoked_at is null;
  return found;
end $$;

-- Creates the run and returns the ciphertext of exactly its two credentials, for the customer's own request.
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
  if not found or c.provider_kind <> 'huggingface' then raise exception 'lab_customer_compute_credential_unavailable'; end if;
  insert into lab.customer_training_runs(organization_id, experiment_id, requested_by, teacher_credential_id,
    teacher_provider_kind, teacher_model, compute_credential_id, compute_provider_kind, base_model, base_model_revision,
    approved_budget_usd, max_hourly_usd)
  values (p_organization_id, p_experiment_id, uid, t.id, t.provider_kind, btrim(p_teacher_model), c.id, 'huggingface',
    p_base_model, nullif(p_base_model_revision, ''), p_approved_budget_usd, p_max_hourly_usd)
  returning id into run_id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (run_id, p_organization_id, 'credentials_released', jsonb_build_object('to','customer_request','user',uid), 'customer');
  return jsonb_build_object('runId', run_id,
    'teacher', jsonb_build_object('id', t.id, 'providerKind', t.provider_kind, 'endpoint', t.endpoint,
      'ciphertext', t.ciphertext, 'iv', t.iv, 'tag', t.tag),
    'compute', jsonb_build_object('id', c.id, 'providerKind', c.provider_kind,
      'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag));
end $$;

create or replace function public.itmounts_lab_customer_list_training_runs(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'runId', id, 'experimentId', experiment_id, 'stage', stage, 'progressPercent', progress_percent,
      'statusMessage', status_message, 'teacherProviderKind', teacher_provider_kind, 'teacherModel', teacher_model,
      'baseModel', base_model, 'approvedBudgetUsd', approved_budget_usd, 'committedMaxCostUsd', committed_max_cost_usd,
      'hfJobUrl', hf_job_url, 'artifactRepo', artifact_repo, 'artifactRevision', artifact_revision,
      'artifactHash', artifact_hash, 'failureCode', failure_code, 'createdAt', created_at, 'updatedAt', updated_at)
      order by created_at desc)
    from lab.customer_training_runs where organization_id = p_organization_id), '[]'::jsonb);
end $$;

-- Customer-requested status refresh: releases only the run's compute credential (to read its own HF job).
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
    'hfNamespace', r.hf_namespace, 'hfJobId', r.hf_job_id, 'hfPendingJobName', r.hf_pending_job_name,
    'jobSubmissionState', r.job_submission_state,
    'compute', jsonb_build_object('id', c.id, 'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag));
end $$;

-- Customer request records a stage transition it just performed (job submitted, teacher rows built, failure).
create or replace function public.itmounts_lab_customer_record_stage(
  p_organization_id uuid, p_run_id uuid, p_stage text, p_progress int, p_message text, p_patch jsonb,
  p_add_committed_cost_usd numeric, p_next_stage_token_hash text
) returns boolean language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_training_forbidden';
  end if;
  perform lab.apply_customer_run_stage(p_run_id, p_organization_id, p_stage, p_progress, p_message, p_patch,
    p_add_committed_cost_usd, p_next_stage_token_hash, 'customer');
  return true;
end $$;

-- 5. Worker-callback functions (single-use stage token; callable by service_role, useless without the token) -------
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
    job_submission_state = coalesce(p_patch->>'jobSubmissionState', job_submission_state),
    pending_job_cost_usd = case when p_patch ? 'hfPendingJobName' then coalesce(p_add_cost, 0)
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

-- Redeems the run's single-use stage token: returns run state + its compute credential ciphertext, and consumes the token.
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
    'trainingMode', r.training_mode, 'approvedBudgetUsd', r.approved_budget_usd, 'maxHourlyUsd', r.max_hourly_usd,
    'committedMaxCostUsd', r.committed_max_cost_usd, 'hfNamespace', r.hf_namespace, 'hfJobId', r.hf_job_id,
    'hfPendingJobName', r.hf_pending_job_name, 'jobSubmissionState', r.job_submission_state,
    'compute', case when c.id is null then null else
      jsonb_build_object('id', c.id, 'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag) end);
end $$;

-- Applies a worker-reported transition. Only valid right after redemption (run_id known only to the redeemer).
create or replace function public.itmounts_lab_worker_record_stage(
  p_run_id uuid, p_organization_id uuid, p_expected_stage text, p_stage text, p_progress int, p_message text,
  p_patch jsonb, p_add_committed_cost_usd numeric, p_next_stage_token_hash text
) returns boolean language plpgsql security definer set search_path = pg_catalog, lab as $$
declare current_stage text;
begin
  select stage into current_stage from lab.customer_training_runs
    where id = p_run_id and organization_id = p_organization_id
      and (stage_token_hash is null or job_submission_state = 'reserved');
  if not found or current_stage <> p_expected_stage then raise exception 'lab_worker_stage_conflict'; end if;
  perform lab.apply_customer_run_stage(p_run_id, p_organization_id, p_stage, p_progress, p_message, p_patch,
    p_add_committed_cost_usd, p_next_stage_token_hash, 'worker_callback');
  return true;
end $$;

-- Releases a reservation whose job provably was NOT created (submit failed and lookup by job name found nothing).
create or replace function lab.release_customer_job_reservation(p_run_id uuid, p_org uuid, p_reason text, p_actor text)
returns void language plpgsql security definer set search_path = pg_catalog, lab as $$
declare r lab.customer_training_runs%rowtype;
begin
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_org for update;
  if not found or r.job_submission_state is distinct from 'reserved' then raise exception 'lab_customer_no_open_reservation'; end if;
  update lab.customer_training_runs set
    committed_max_cost_usd = greatest(0, committed_max_cost_usd - pending_job_cost_usd),
    pending_job_cost_usd = 0, job_submission_state = 'released', stage = 'failed',
    failure_code = left(p_reason, 120), status_message = left('Job was not created: ' || p_reason, 300),
    stage_token_hash = null, stage_token_expires_at = null, updated_at = now()
  where id = p_run_id;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (p_run_id, p_org, 'reservation_released', jsonb_build_object('reason', p_reason, 'usd', r.pending_job_cost_usd), p_actor);
end $$;
revoke all on function lab.release_customer_job_reservation(uuid,uuid,text,text) from public, anon, authenticated, service_role;

create or replace function public.itmounts_lab_customer_release_reservation(p_organization_id uuid, p_run_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
begin
  if coalesce(lab.customer_member_role(uid, p_organization_id), '') not in ('owner','admin') then
    raise exception 'lab_customer_training_forbidden';
  end if;
  perform lab.release_customer_job_reservation(p_run_id, p_organization_id, p_reason, 'customer');
  return true;
end $$;

create or replace function public.itmounts_lab_worker_release_reservation(p_run_id uuid, p_organization_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = pg_catalog, lab as $$
begin
  -- Only right after a token redemption (token cleared) and only for an open reservation.
  perform 1 from lab.customer_training_runs where id = p_run_id and organization_id = p_organization_id
    and job_submission_state = 'reserved' and stage_token_hash is not null;
  if not found then raise exception 'lab_worker_stage_conflict'; end if;
  perform lab.release_customer_job_reservation(p_run_id, p_organization_id, p_reason, 'worker_callback');
  return true;
end $$;

-- Download: any ACTIVE member of the organization (no graduation/certification), completed runs only.
-- Releases the run's compute credential to this server request so it can stream the files on the member's behalf.
create or replace function public.itmounts_lab_customer_open_run_download(p_organization_id uuid, p_run_id uuid)
returns jsonb language plpgsql security definer set search_path = pg_catalog, lab as $$
declare uid uuid := lab.customer_session_user();
declare r lab.customer_training_runs%rowtype;
declare c lab.provider_credentials%rowtype;
begin
  if lab.customer_member_role(uid, p_organization_id) is null then raise exception 'lab_customer_training_forbidden'; end if;
  select * into r from lab.customer_training_runs where id = p_run_id and organization_id = p_organization_id;
  if not found then raise exception 'lab_customer_run_not_found'; end if;
  if r.stage <> 'completed' or r.artifact_repo is null or r.artifact_files is null then raise exception 'lab_customer_artifact_not_ready'; end if;
  select * into c from lab.provider_credentials
    where id = r.compute_credential_id and organization_id = p_organization_id and revoked_at is null;
  if not found then raise exception 'lab_customer_compute_credential_unavailable'; end if;
  insert into lab.customer_training_events(run_id, organization_id, event, detail, actor)
  values (r.id, p_organization_id, 'credentials_released', jsonb_build_object('to','customer_download','user',uid), 'customer');
  return jsonb_build_object('runId', r.id, 'artifactRepo', r.artifact_repo, 'artifactRevision', r.artifact_revision,
    'artifactHash', r.artifact_hash, 'artifactFiles', r.artifact_files,
    'compute', jsonb_build_object('id', c.id, 'ciphertext', c.ciphertext, 'iv', c.iv, 'tag', c.tag));
end $$;

-- 6. Grants -------------------------------------------------------------------------------------------------------
revoke all on function public.itmounts_lab_customer_store_credential(uuid,uuid,text,text,text,text,text,text) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_list_credentials(uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_revoke_credential(uuid,uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_create_training_run(uuid,uuid,uuid,text,uuid,text,text,numeric,numeric) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_list_training_runs(uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_open_run_compute(uuid,uuid) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_record_stage(uuid,uuid,text,int,text,jsonb,numeric,text) from public, anon, service_role;
grant execute on function public.itmounts_lab_customer_store_credential(uuid,uuid,text,text,text,text,text,text) to authenticated;
grant execute on function public.itmounts_lab_customer_list_credentials(uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_revoke_credential(uuid,uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_create_training_run(uuid,uuid,uuid,text,uuid,text,text,numeric,numeric) to authenticated;
grant execute on function public.itmounts_lab_customer_list_training_runs(uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_open_run_compute(uuid,uuid) to authenticated;
grant execute on function public.itmounts_lab_customer_record_stage(uuid,uuid,text,int,text,jsonb,numeric,text) to authenticated;
revoke all on function public.itmounts_lab_customer_release_reservation(uuid,uuid,text) from public, anon, service_role;
revoke all on function public.itmounts_lab_customer_open_run_download(uuid,uuid) from public, anon, service_role;
grant execute on function public.itmounts_lab_customer_release_reservation(uuid,uuid,text) to authenticated;
grant execute on function public.itmounts_lab_customer_open_run_download(uuid,uuid) to authenticated;

revoke all on function public.itmounts_lab_worker_redeem_stage_token(text) from public, anon, authenticated;
revoke all on function public.itmounts_lab_worker_record_stage(uuid,uuid,text,text,int,text,jsonb,numeric,text) from public, anon, authenticated;
grant execute on function public.itmounts_lab_worker_redeem_stage_token(text) to service_role;
grant execute on function public.itmounts_lab_worker_record_stage(uuid,uuid,text,text,int,text,jsonb,numeric,text) to service_role;
revoke all on function public.itmounts_lab_worker_release_reservation(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.itmounts_lab_worker_release_reservation(uuid,uuid,text) to service_role;
