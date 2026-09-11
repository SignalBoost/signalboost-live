create table if not exists public.guardian_repository_review_evidence (
  finding_id text primary key,
  review_id uuid not null references public.remediation_requests(id) on delete cascade,
  recorded_at timestamptz not null default now()
);

alter table public.guardian_repository_review_evidence enable row level security;
revoke all on table public.guardian_repository_review_evidence from public, anon, authenticated;
grant select, insert on table public.guardian_repository_review_evidence to service_role;

insert into public.guardian_repository_review_evidence (finding_id, review_id)
select finding->>'id', request.id
  from public.remediation_requests request
  cross join lateral pg_catalog.jsonb_array_elements(coalesce(request.findings, '[]'::jsonb)) as retained(finding)
  where request.source_type = 'guardian_repository_change'
    and coalesce(finding->>'id', '') <> ''
on conflict (finding_id) do nothing;

insert into public.guardian_repository_review_evidence (finding_id, review_id)
select distinct event.incident_id,
       case when event.payload->>'reviewRequestId' ~ '^[0-9a-fA-F-]{36}$'
         then (event.payload->>'reviewRequestId')::uuid end
  from public.supervisor_audit_events event
  join public.remediation_requests request
    on request.id = case when event.payload->>'reviewRequestId' ~ '^[0-9a-fA-F-]{36}$'
      then (event.payload->>'reviewRequestId')::uuid end
   and request.source_type = 'guardian_repository_change'
  where event.event_type = 'policy_evaluated'
    and event.incident_id like 'guardian-repository-change:%'
    and coalesce(event.payload->>'reviewRequestId', '') ~ '^[0-9a-fA-F-]{36}$'
on conflict (finding_id) do nothing;

create or replace function public.record_guardian_repository_review_observation(
  p_alert_id uuid,
  p_group_key text,
  p_alert jsonb,
  p_review jsonb,
  p_finding jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_review_id uuid;
  v_alert_id uuid;
  v_findings jsonb;
  v_evidence_count integer;
begin
  if p_group_key = '' or p_group_key is null
     or p_review->>'source_type' <> 'guardian_repository_change'
     or p_group_key <> 'guardian-repository-change:' || pg_catalog.lower(p_review->>'repo')
     or jsonb_typeof(p_finding) <> 'object' then
    raise exception 'guardian_review_group_key_required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_group_key, 0));

  select review_id
    into v_review_id
    from public.guardian_repository_review_evidence
    where finding_id = p_finding->>'id';

  if found then
    select source_id into v_alert_id
      from public.remediation_requests
      where id = v_review_id;
    return jsonb_build_object('ok', true, 'reviewRequestId', v_review_id, 'alertId', v_alert_id, 'reviewCreated', false, 'alertCreated', false);
  end if;

  select id, source_id
    into v_review_id, v_alert_id
    from public.remediation_requests
    where source_type = 'guardian_repository_change'
      and repo = p_review->>'repo'
      and status in ('awaiting_human_review', 'in_progress')
    order by created_at desc
    limit 1
    for update;

  if found then
    select coalesce(jsonb_agg(item order by ordinal), '[]'::jsonb)
      into v_findings
      from (
        select item, ordinal
          from pg_catalog.jsonb_array_elements(jsonb_build_array(p_finding) || coalesce((select findings from public.remediation_requests where id = v_review_id), '[]'::jsonb))
            with ordinality as evidence(item, ordinal)
          order by ordinal
          limit 100
      ) retained;

    select coalesce((severity_summary->>'evidenceCount')::integer, jsonb_array_length(findings), 0) + 1
      into v_evidence_count
      from public.remediation_requests where id = v_review_id;

    update public.remediation_requests
      set findings = v_findings,
          severity_summary = jsonb_set(coalesce(severity_summary, '{}'::jsonb), '{evidenceCount}', to_jsonb(v_evidence_count), true),
          updated_at = now()
      where id = v_review_id;

    update public.cyber_alerts
      set status = 'open', resolved_at = null, message = p_alert->>'message'
      where id = v_alert_id;

    insert into public.guardian_repository_review_evidence (finding_id, review_id)
    values (p_finding->>'id', v_review_id);

    return jsonb_build_object('ok', true, 'reviewRequestId', v_review_id, 'alertId', v_alert_id, 'reviewCreated', false, 'alertCreated', false);
  end if;

  insert into public.cyber_alerts (id, user_id, repo, severity, advisory_id, title, message, status)
  values (p_alert_id, null, p_alert->>'repo', p_alert->>'severity', p_alert->>'advisory_id', p_alert->>'title', p_alert->>'message', 'open');

  insert into public.remediation_requests (
    id, user_id, source_area, source_type, source_id, repo, target, title, summary,
    severity_summary, findings, status, human_approval_required, human_approved,
    fix_plan, fix_plan_status, fix_plan_created_at, fix_plan_approved, implementation_status
  ) values (
    p_alert_id, null, p_review->>'source_area', p_review->>'source_type', p_alert_id,
    p_review->>'repo', p_review->>'target', p_review->>'title', p_review->>'summary',
    jsonb_set(coalesce(p_review->'severity_summary', '{}'::jsonb), '{evidenceCount}', '1'::jsonb, true),
    jsonb_build_array(p_finding), p_review->>'status', true, false,
    p_review->'fix_plan', p_review->>'fix_plan_status', (p_review->>'fix_plan_created_at')::timestamptz,
    false, 'not_applicable'
  );

  insert into public.guardian_repository_review_evidence (finding_id, review_id)
  values (p_finding->>'id', p_alert_id);

  return jsonb_build_object('ok', true, 'reviewRequestId', p_alert_id, 'alertId', p_alert_id, 'reviewCreated', true, 'alertCreated', true);
end;
$$;

revoke all on function public.record_guardian_repository_review_observation(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_guardian_repository_review_observation(uuid, text, jsonb, jsonb, jsonb) to service_role;
