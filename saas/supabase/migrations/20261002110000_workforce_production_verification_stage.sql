-- Close the Workforce verification stage honestly: served Production work awaits a governed outcome.
alter table public.cos_workforce_assignments
  drop constraint if exists cos_workforce_assignments_status_check;
alter table public.cos_workforce_assignments
  add constraint cos_workforce_assignments_status_check
  check (status in ('assigned','working','completed','served','verified','runtime_failed','failed','remediation'));

update public.cos_workforce_assignments
set status = 'served', updated_at = now()
where status = 'completed';

create or replace view public.cos_workforce_stage
with (security_invoker=true) as
select
  g.id registry_id,
  b.permanent_artifact_id ai_id,
  g.subject_id,
  g.promoted_at graduated_at,
  w.id workforce_roster_id,
  w.hired_at workforce_entered_at,
  w.status workforce_status,
  a.id assignment_id,
  a.source_kind,
  a.source_ref,
  a.status assignment_status,
  a.assigned_at,
  a.started_at,
  a.completed_at,
  case
    when g.status <> 'active' then 'GRADUATED_HOLD'
    when w.id is null then 'GRADUATED'
    when a.id is null then 'WORKFORCE_AVAILABLE'
    when a.status = 'assigned' then 'ASSIGNED'
    when a.status = 'working' then 'WORKING'
    when coalesce(c.verified,0) > 0 then 'PRODUCTION_VERIFIED'
    when a.status = 'served' and a.source_kind = 'production_request' then 'AWAITING_PRODUCTION_VERIFICATION'
    when a.status = 'served' and a.source_kind = 'production_shadow' then 'SHADOW_SERVED'
    when a.status = 'runtime_failed' then 'RUNTIME_RECOVERY'
    when a.status in ('failed','remediation') then 'REMEDIATION'
    else 'WORKFORCE_AVAILABLE'
  end workforce_stage
from public.cos_university_graduate_model_registry g
join public.cos_university_artifact_birth_certificates b
  on b.candidate_id=g.candidate_id and b.trained_artifact_hash=g.trained_artifact_hash
left join public.cos_workforce_roster w on w.registry_id=g.id
left join lateral (
  select count(*)::int verified
  from public.cos_university_graduate_lifecycle_events e
  where e.registry_id=g.id and e.event_type='verified_outcome'
) c on true
left join lateral (
  select x.* from public.cos_workforce_assignments x
  where x.registry_id=g.id
  order by x.assigned_at desc limit 1
) a on true;

revoke all on public.cos_workforce_stage from public,anon,authenticated;
grant select on public.cos_workforce_stage to service_role;
comment on view public.cos_workforce_stage is
  'Post-University employment lifecycle: served Production work awaits governed verification; shadow/runtime outcomes are not competence verdicts.';
