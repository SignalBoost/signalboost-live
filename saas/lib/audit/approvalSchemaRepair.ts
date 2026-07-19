// Canonical, bounded production repair for the audit approval schema.
//
// This SQL is never accepted from a request. The owner-gated approval route may
// execute only these exact idempotent statements through the existing
// service-role-only hub_exec_sql RPC after detecting known approval-schema drift.
// hub_exec_sql executes one prepared statement per invocation, so the migration
// is intentionally split into an ordered sequence instead of one multi-command
// string. A failed step stops the repair; the next owner retry safely resumes.
//
// STEP 1 is a DROP: `create or replace function` cannot change the return
// signature of an existing function, so a stale approve_audit_run_remediation
// (e.g. an earlier version that returned a different shape or wrote a nonexistent
// audit_runs.approved column) would make every repair fail at the create-function
// step. Dropping it first is safe and idempotent — the function is recreated later
// in this same sequence.
//
// The function statement carries two required correctness details:
//   * "timestamp" is quoted — it is a reserved word and is rejected as a bare
//     output-column name in the returns-table list.
//   * #variable_conflict use_column — the output columns run_id / approved_by
//     share names with real table columns used in the body; without it the body
//     raises "column reference run_id is ambiguous" at run time.

export const AUDIT_APPROVAL_SCHEMA_REPAIR_STATEMENTS = [
  String.raw`drop function if exists public.approve_audit_run_remediation(uuid, uuid)`,

  String.raw`create table if not exists public.audit_remediation_approvals (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.audit_runs(id) on delete cascade,
    approved_by uuid references auth.users(id) on delete set null,
    findings_fixed integer not null check (findings_fixed >= 0),
    status text not null check (status = 'approved'),
    approved_at timestamptz not null default now(),
    rollback_entry_point text not null default 'thin',
    unique (run_id)
  )`,

  String.raw`create index if not exists audit_remediation_approvals_run_idx
    on public.audit_remediation_approvals (run_id, approved_at desc)`,

  String.raw`alter table public.audit_remediation_approvals enable row level security`,

  String.raw`alter table public.audit_findings
    add column if not exists fixed boolean not null default false,
    add column if not exists fixed_at timestamptz`,

  String.raw`create or replace function public.approve_audit_run_remediation(
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
    "timestamp" text
  )
  language plpgsql
  security definer
  set search_path = public
  as $repair$
  #variable_conflict use_column
  declare
    v_count integer;
    v_timestamp timestamptz := now();
  begin
    update public.audit_runs
    set status = 'approved'
    where id = p_run_id and status = 'complete';

    if not found then
      if exists (select 1 from public.audit_remediation_approvals a where a.run_id = p_run_id) then
        return query select false, 'already_approved', 'This audit run was already approved.', p_run_id, null::uuid, 0, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
      elsif exists (select 1 from public.audit_runs r where r.id = p_run_id) then
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
  $repair$`,

  String.raw`revoke all on function public.approve_audit_run_remediation(uuid, uuid) from public`,

  String.raw`grant execute on function public.approve_audit_run_remediation(uuid, uuid) to service_role`,

  String.raw`notify pgrst, 'reload schema'`,
] as const
