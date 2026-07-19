-- One durable owner approval for all remediation fixes belonging to one audit run.
-- Approval does not touch main or production: the existing thin entry point and
-- Supervisor rollback path remain available if a staged remediation is corrupt.

create table if not exists public.audit_remediation_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.audit_runs(id) on delete cascade,
  approved_by uuid references auth.users(id) on delete set null,
  findings_fixed integer not null check (findings_fixed >= 0),
  status text not null check (status = 'approved'),
  approved_at timestamptz not null default now(),
  rollback_entry_point text not null default 'thin',
  unique (run_id)
);

create index if not exists audit_remediation_approvals_run_idx
  on public.audit_remediation_approvals (run_id, approved_at desc);

alter table public.audit_remediation_approvals enable row level security;

-- The service-role audit route invokes this function. Its conditional update is
-- the idempotency boundary: only a completed current run can transition once.
create or replace function public.approve_audit_run_remediation(
  p_run_id uuid,
  p_approved_by uuid
)
returns table (
  approved boolean,
  reason text,
  message text,
  run_id uuid,
  approved_by uuid,
  findings_fixed integer,
  timestamp text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_timestamp timestamptz := now();
begin
  update public.audit_runs
  set status = 'approved'
  where id = p_run_id and status = 'complete';

  if not found then
    if exists (select 1 from public.audit_remediation_approvals where run_id = p_run_id) then
      return query select false, 'already_approved', 'This audit run was already approved.', p_run_id, null::uuid, 0, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    elsif exists (select 1 from public.audit_runs where id = p_run_id) then
      return query select false, 'run_not_complete', 'Only a completed audit run can be approved.', p_run_id, null::uuid, 0, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    else
      return query select false, 'run_not_found', 'Audit run not found.', p_run_id, null::uuid, 0, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    end if;
    return;
  end if;

  select count(*)::integer into v_count from public.audit_findings where run_id = p_run_id;
  insert into public.audit_remediation_approvals (run_id, approved_by, findings_fixed, status, approved_at)
  values (p_run_id, p_approved_by, v_count, 'approved', v_timestamp);

  insert into public.audit_logs (run_id, user_id, payload)
  values (
    p_run_id,
    p_approved_by,
    jsonb_build_object(
      'event', 'audit_run_approved',
      'runId', p_run_id,
      'approvedBy', p_approved_by,
      'findingsFixed', v_count,
      'status', 'approved',
      'timestamp', to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
      'rollbackEntryPoint', 'thin'
    )
  );

  return query select true, null::text, null::text, p_run_id, p_approved_by, v_count, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
end;
$$;
