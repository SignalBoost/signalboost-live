create or replace function public.record_guardian_review_disposition(
  p_remediation_id uuid,
  p_status text,
  p_approval_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_source_type text;
  v_source_id uuid;
  v_now timestamptz := now();
begin
  if p_status not in ('awaiting_human_review', 'in_progress', 'rejected', 'completed', 'cancelled') then
    raise exception 'guardian_review_invalid_disposition';
  end if;

  select source_type, source_id
    into v_source_type, v_source_id
    from public.remediation_requests
    where id = p_remediation_id
    for update;

  if not found then raise exception 'guardian_review_not_found'; end if;
  if v_source_type <> 'guardian_repository_change' then raise exception 'guardian_review_source_mismatch'; end if;

  update public.remediation_requests
    set status = p_status,
        human_approved = false,
        approved_by = null,
        approved_at = null,
        approval_notes = nullif(trim(p_approval_notes), ''),
        fix_plan_status = case when p_status = 'awaiting_human_review' then 'review_only' else 'review_disposition_recorded' end,
        fix_plan_approved = false,
        implementation_status = 'not_applicable',
        updated_at = v_now
    where id = p_remediation_id;

  if v_source_id is not null and p_status in ('completed', 'cancelled') then
    update public.cyber_alerts
      set status = case when p_status = 'completed' then 'resolved' else 'ignored' end,
          resolved_at = v_now
      where id = v_source_id;
    if not found then raise exception 'guardian_linked_alert_not_found'; end if;
  end if;

  return jsonb_build_object('ok', true, 'reviewOnly', true, 'status', p_status);
end;
$$;

revoke all on function public.record_guardian_review_disposition(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_guardian_review_disposition(uuid, text, text) to service_role;
