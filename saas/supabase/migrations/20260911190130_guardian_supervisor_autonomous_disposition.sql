-- Routine Guardian observations were previously placed in an owner queue solely
-- because they touched a sensitive path. Under Supervisor policy, observation-only
-- evidence is recorded and closed automatically; it does not authorize mutation.
update public.remediation_requests
set status = 'completed',
    human_approval_required = false,
    human_approved = false,
    approval_notes = coalesce(approval_notes, 'Automatically classified as expected authenticated repository activity by the Self-Healing Supervisor.'),
    fix_plan_status = 'not_required',
    implementation_status = 'supervisor_auto_dispositioned',
    implementation_notes = 'Observation retained for audit. No repair or provider mutation was authorized.',
    updated_at = now()
where source_type = 'guardian_repository_change'
  and status in ('awaiting_human_review', 'in_progress')
  and coalesce(fix_plan->>'disposition', '') = 'review_only';

update public.cyber_alerts as alert
set status = 'resolved',
    resolved_at = now()
where alert.status = 'open'
  and exists (
    select 1
    from public.remediation_requests as request
    where request.source_type = 'guardian_repository_change'
      and request.source_id = alert.id
      and request.status = 'completed'
      and request.implementation_status = 'supervisor_auto_dispositioned'
  );
