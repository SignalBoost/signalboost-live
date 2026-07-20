-- Owner approval records consent only. Findings become fixed only after the
-- governed GitHub remediation pull request has merged into main.

create or replace function public.approve_audit_run_remediation_v2(
  p_run_id uuid,
  p_approved_by uuid
)
returns table (
  approved boolean,
  reason text,
  message text,
  run_id uuid,
  approved_by uuid,
  findings_approved integer,
  "timestamp" text
)
language plpgsql
security definer
set search_path = public
as $lifecycle$
#variable_conflict use_column
declare
  v_count integer := 0;
  v_timestamp timestamptz := now();
begin
  select count(*)::integer
    into v_count
    from public.audit_findings f
    where f.run_id = p_run_id;

  update public.audit_runs
     set status = 'approved'
   where id = p_run_id
     and status = 'complete';

  if not found then
    if exists (select 1 from public.audit_remediation_approvals a where a.run_id = p_run_id) then
      return query select false, 'already_approved', 'This audit run was already approved.', p_run_id, null::uuid, v_count, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    elsif exists (select 1 from public.audit_runs r where r.id = p_run_id) then
      return query select false, 'run_not_complete', 'Only a completed audit run can be approved.', p_run_id, null::uuid, v_count, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    else
      return query select false, 'run_not_found', 'Audit run not found.', p_run_id, null::uuid, 0, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    end if;
    return;
  end if;

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
    0,
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
      'findingsApproved', v_count,
      'findingsFixed', 0,
      'status', 'approved',
      'remediationStatus', 'preparing',
      'timestamp', to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
      'rollbackEntryPoint', 'thin'
    )
  );

  return query select true, null::text, null::text, p_run_id, p_approved_by, v_count, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
end;
$lifecycle$;

revoke all on function public.approve_audit_run_remediation_v2(uuid, uuid) from public;
grant execute on function public.approve_audit_run_remediation_v2(uuid, uuid) to service_role;

create or replace function public.finalize_audit_run_remediation_v2(
  p_run_id uuid,
  p_actor_user_id uuid,
  p_pr_number integer,
  p_pr_url text,
  p_merge_commit_sha text
)
returns table (
  finalized boolean,
  findings_fixed integer,
  "timestamp" text
)
language plpgsql
security definer
set search_path = public
as $lifecycle$
#variable_conflict use_column
declare
  v_count integer := 0;
  v_timestamp timestamptz := now();
begin
  if not exists (select 1 from public.audit_remediation_approvals a where a.run_id = p_run_id) then
    return query select false, 0, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
    return;
  end if;

  update public.audit_findings
     set fixed = true,
         fixed_at = coalesce(fixed_at, v_timestamp)
   where run_id = p_run_id;

  select count(*)::integer
    into v_count
    from public.audit_findings f
    where f.run_id = p_run_id
      and f.fixed = true;

  update public.audit_runs
     set status = 'remediated'
   where id = p_run_id;

  update public.audit_remediation_approvals
     set findings_fixed = v_count
   where run_id = p_run_id;

  if not exists (
    select 1
      from public.audit_logs l
     where l.run_id = p_run_id
       and l.payload ->> 'event' = 'audit_run_remediated'
       and l.payload ->> 'mergeCommitSha' = coalesce(p_merge_commit_sha, '')
  ) then
    insert into public.audit_logs (run_id, user_id, payload)
    values (
      p_run_id,
      p_actor_user_id,
      jsonb_build_object(
        'event', 'audit_run_remediated',
        'runId', p_run_id,
        'findingsFixed', v_count,
        'status', 'remediated',
        'pullRequestNumber', p_pr_number,
        'pullRequestUrl', p_pr_url,
        'mergeCommitSha', p_merge_commit_sha,
        'timestamp', to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS'),
        'rollbackEntryPoint', 'thin'
      )
    );
  end if;

  return query select true, v_count, to_char(v_timestamp at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS');
end;
$lifecycle$;

revoke all on function public.finalize_audit_run_remediation_v2(uuid, uuid, integer, text, text) from public;
grant execute on function public.finalize_audit_run_remediation_v2(uuid, uuid, integer, text, text) to service_role;

notify pgrst, 'reload schema';
