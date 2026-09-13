-- Short-lived operational capability for one explicitly owner-approved teacher-dataset dispatch.
-- This table is intentionally separate from the immutable University assurance ledger. The ledger
-- remains append-only audit evidence; this table provides the mutable single-use claim fence.

create table if not exists public.cos_university_one_time_teacher_dispatch_approvals (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  candidate_id text not null check (candidate_id ~ '^study-plan:[0-9a-fA-F-]{36}$'),
  subject_id text not null check (subject_id = 'reasoning_decision_science'),
  operation text not null default 'generate_teacher_dataset'
    check (operation = 'generate_teacher_dataset'),
  status text not null default 'pending'
    check (status in ('pending','claimed','dispatched','failed')),
  max_hourly_cost_usd numeric(10,6) not null
    check (max_hourly_cost_usd > 0 and max_hourly_cost_usd <= 1.000000),
  max_estimated_cost_usd numeric(10,6) not null
    check (max_estimated_cost_usd > 0 and max_estimated_cost_usd <= 0.200000),
  student_training_authorized boolean not null default false
    check (student_training_authorized = false),
  authority_expanded boolean not null default false
    check (authority_expanded = false),
  authorized_at timestamptz not null,
  expires_at timestamptz not null,
  claimed_at timestamptz,
  completed_at timestamptz,
  job_id text,
  job_url text,
  error text,
  created_at timestamptz not null default now(),
  check (expires_at > authorized_at),
  check (expires_at <= authorized_at + interval '15 minutes'),
  check ((status = 'pending' and claimed_at is null and completed_at is null)
    or (status = 'claimed' and claimed_at is not null and completed_at is null)
    or (status in ('dispatched','failed') and claimed_at is not null and completed_at is not null)),
  check (status <> 'dispatched' or job_id is not null)
);

comment on table public.cos_university_one_time_teacher_dispatch_approvals is
  'Mutable operational fence for a single explicitly approved teacher-dataset provider dispatch. Audit evidence remains in the append-only University assurance ledger.';

alter table public.cos_university_one_time_teacher_dispatch_approvals enable row level security;
revoke all on public.cos_university_one_time_teacher_dispatch_approvals from public, anon, authenticated, service_role;

create or replace function public.claim_cos_university_one_time_teacher_dispatch(p_token_hash text)
returns table (
  token_hash text,
  candidate_id text,
  max_hourly_cost_usd numeric,
  max_estimated_cost_usd numeric,
  expires_at timestamptz,
  claimed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.cos_university_one_time_teacher_dispatch_approvals%rowtype;
  v_evidence jsonb;
  v_evidence_hash text;
  v_event_key text;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'one_time_teacher_approval_token_invalid';
  end if;

  update public.cos_university_one_time_teacher_dispatch_approvals
  set status = 'claimed', claimed_at = v_now
  where cos_university_one_time_teacher_dispatch_approvals.token_hash = p_token_hash
    and status = 'pending'
    and subject_id = 'reasoning_decision_science'
    and operation = 'generate_teacher_dataset'
    and student_training_authorized = false
    and authority_expanded = false
    and authorized_at <= v_now + interval '60 seconds'
    and expires_at > v_now
    and expires_at <= authorized_at + interval '15 minutes'
    and max_hourly_cost_usd > 0 and max_hourly_cost_usd <= 1.000000
    and max_estimated_cost_usd > 0 and max_estimated_cost_usd <= 0.200000
  returning * into v_row;

  if not found then
    raise exception 'one_time_teacher_approval_unavailable';
  end if;

  v_evidence := jsonb_build_object(
    'profile', 'cos_university_one_time_teacher_dispatch_v1',
    'claim', 'teacher_dataset_one_time_approval_claimed',
    'candidateId', v_row.candidate_id,
    'subjectId', v_row.subject_id,
    'operation', v_row.operation,
    'tokenHash', v_row.token_hash,
    'authorizedAt', v_row.authorized_at,
    'expiresAt', v_row.expires_at,
    'claimedAt', v_row.claimed_at,
    'maxHourlyCostUsd', v_row.max_hourly_cost_usd,
    'maxEstimatedCostUsd', v_row.max_estimated_cost_usd,
    'studentTrainingAuthorized', false,
    'authorityExpanded', false
  );
  v_evidence_hash := encode(extensions.digest(convert_to(v_evidence::text, 'UTF8'), 'sha256'), 'hex');
  v_event_key := encode(extensions.digest(convert_to(
    'cos_university_one_time_teacher_dispatch_v1:claimed:' || v_row.token_hash || ':' || v_row.claimed_at::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.cos_university_learning_assurance_events (
    event_key, event_type, subject_id, candidate_id, evidence_hash, evidence, verifier, observed_at, expires_at
  ) values (
    v_event_key, 'fine_tune', v_row.subject_id, v_row.candidate_id,
    v_evidence_hash, v_evidence, 'host_controller', v_row.claimed_at, v_row.expires_at
  );

  return query select
    v_row.token_hash,
    v_row.candidate_id,
    v_row.max_hourly_cost_usd,
    v_row.max_estimated_cost_usd,
    v_row.expires_at,
    v_row.claimed_at;
end;
$$;

revoke all on function public.claim_cos_university_one_time_teacher_dispatch(text) from public, anon, authenticated;
grant execute on function public.claim_cos_university_one_time_teacher_dispatch(text) to service_role;

create or replace function public.finish_cos_university_one_time_teacher_dispatch(
  p_token_hash text,
  p_claimed_at timestamptz,
  p_status text,
  p_job_id text default null,
  p_job_url text default null,
  p_error text default null
)
returns table (token_hash text, status text, completed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.cos_university_one_time_teacher_dispatch_approvals%rowtype;
  v_evidence jsonb;
  v_evidence_hash text;
  v_event_key text;
begin
  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'one_time_teacher_approval_token_invalid';
  end if;
  if p_status not in ('dispatched','failed') then
    raise exception 'one_time_teacher_approval_terminal_status_invalid';
  end if;
  if p_status = 'dispatched' and nullif(btrim(coalesce(p_job_id, '')), '') is null then
    raise exception 'one_time_teacher_approval_job_id_required';
  end if;

  update public.cos_university_one_time_teacher_dispatch_approvals
  set status = p_status,
      completed_at = v_now,
      job_id = case when p_status = 'dispatched' then left(p_job_id, 240) else null end,
      job_url = case when p_status = 'dispatched' then left(nullif(p_job_url, ''), 2000) else null end,
      error = case when p_status = 'failed' then left(nullif(p_error, ''), 200) else null end
  where cos_university_one_time_teacher_dispatch_approvals.token_hash = p_token_hash
    and status = 'claimed'
    and claimed_at = p_claimed_at
  returning * into v_row;

  if not found then
    raise exception 'one_time_teacher_approval_finalize_fence_lost';
  end if;

  v_evidence := jsonb_build_object(
    'profile', 'cos_university_one_time_teacher_dispatch_v1',
    'claim', case when p_status = 'dispatched'
      then 'teacher_dataset_one_time_approval_dispatched'
      else 'teacher_dataset_one_time_approval_failed' end,
    'candidateId', v_row.candidate_id,
    'subjectId', v_row.subject_id,
    'operation', v_row.operation,
    'tokenHash', v_row.token_hash,
    'authorizedAt', v_row.authorized_at,
    'expiresAt', v_row.expires_at,
    'claimedAt', v_row.claimed_at,
    'completedAt', v_row.completed_at,
    'maxHourlyCostUsd', v_row.max_hourly_cost_usd,
    'maxEstimatedCostUsd', v_row.max_estimated_cost_usd,
    'jobId', v_row.job_id,
    'jobUrl', v_row.job_url,
    'error', v_row.error,
    'studentTrainingAuthorized', false,
    'authorityExpanded', false
  );
  v_evidence_hash := encode(extensions.digest(convert_to(v_evidence::text, 'UTF8'), 'sha256'), 'hex');
  v_event_key := encode(extensions.digest(convert_to(
    'cos_university_one_time_teacher_dispatch_v1:' || p_status || ':' || v_row.token_hash || ':' || v_row.completed_at::text,
    'UTF8'
  ), 'sha256'), 'hex');

  insert into public.cos_university_learning_assurance_events (
    event_key, event_type, subject_id, candidate_id, evidence_hash, evidence, verifier, observed_at
  ) values (
    v_event_key, 'fine_tune', v_row.subject_id, v_row.candidate_id,
    v_evidence_hash, v_evidence, 'host_controller', v_row.completed_at
  );

  return query select v_row.token_hash, v_row.status, v_row.completed_at;
end;
$$;

revoke all on function public.finish_cos_university_one_time_teacher_dispatch(text,timestamptz,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.finish_cos_university_one_time_teacher_dispatch(text,timestamptz,text,text,text,text)
  to service_role;

-- Direct mutation is deliberately unavailable to application roles. The service role can only
-- claim/finalize through the two fenced RPCs above; each RPC appends immutable audit evidence.
