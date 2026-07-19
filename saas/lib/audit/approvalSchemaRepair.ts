// Canonical, bounded production repair for the audit approval schema.
//
// This SQL is never accepted from a request. The owner-gated approval route may
// execute this exact idempotent statement through the existing service-role-only
// hub_exec_sql RPC only after detecting the known audit approval schema drift.
// The RPC call itself is one database transaction, so transaction-control
// statements are intentionally omitted.

export const AUDIT_APPROVAL_SCHEMA_REPAIR_SQL = String.raw`
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

alter table public.audit_findings
  add column if not exists fixed boolean not null default false,
  add column if not exists fixed_at timestamptz;

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
as $repair$
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

  update public.audit_findings
  set fixed = true,
      fixed_at = v_timestamp
  where run_id = p_run_id;
  get diagnostics v_count = row_count;

  insert into public.audit_remediation_approvals (
    run_id,
    approved_by,
    findings_fixed,
    status,
    approved_at,
    rollback_entry_point
  ) values (
    p_run_id,
    p_approved_by,
    v_count,
    'approved',
    v_timestamp,
    'thin'
  );

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
$repair$;

revoke all on function public.approve_audit_run_remediation(uuid, uuid) from public;
grant execute on function public.approve_audit_run_remediation(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
`.trim()
