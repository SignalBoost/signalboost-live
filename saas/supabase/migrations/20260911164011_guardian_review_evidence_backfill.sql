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
