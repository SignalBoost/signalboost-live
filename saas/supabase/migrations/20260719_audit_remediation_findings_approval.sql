-- Record the approved batch outcome on the findings belonging to an immutable
-- audit run. This extends the global approval RPC after its initial deployment;
-- it does not apply code or infrastructure changes.

alter table public.audit_findings
  add column if not exists fixed boolean not null default false,
  add column if not exists fixed_at timestamptz;

-- The service-role, owner-gated route calls this RPC. Keep the approval,
-- finding-state update, approval record, and immutable audit event in one
-- transaction so an approval cannot be partially persisted.
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

  update public.audit_findings
  set fixed = true,
      fixed_at = v_timestamp
  where run_id = p_run_id;
  get diagnostics v_count = row_count;

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
