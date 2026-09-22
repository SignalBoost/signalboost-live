-- Forward gate: Builder / Computer Science exact-artifact canary is a post-Residency final proof.
-- A trained Builder artifact cannot be claimed until its formal Residency is complete, the controlling
-- approval is newer than Residency completion, and any historical pre-Residency canary pass is ignored.
-- All existing one-invocation, <=$0.20, preflight, identity and no-Production-traffic limits remain unchanged.
create or replace function public.claim_next_mass_distilled_runtime_canary()
returns table (
  candidate_id text,
  subject_id text,
  artifact_id text,
  artifact_hash text,
  revision_key text,
  evidence_ref text,
  approval_observed_at timestamptz,
  max_canary_invocations integer,
  max_estimated_canary_cost_usd numeric,
  reservation_event_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact public.cos_local_distillation_artifacts%rowtype;
  v_control public.cos_university_learning_assurance_events%rowtype;
  v_evidence jsonb;
  v_max_invocations integer;
  v_max_cost numeric;
  v_invocations integer;
  v_preflight_failures integer;
  v_reservations integer;
  v_now timestamptz := clock_timestamp();
  v_event_key text;
  v_evidence_hash text;
  v_reservation jsonb;
  v_residency_completed_at timestamptz;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mass-distilled-runtime-canary-global', 0));

  -- One active reservation at a time. A reservation is released immediately by a durable preflight
  -- failure or final canary outcome; otherwise it self-expires after eight minutes.
  if exists (
    select 1
    from public.cos_university_learning_assurance_events s
    where s.event_type='fine_tune'
      and s.candidate_id like 'mass:%'
      and s.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and s.evidence->>'claim'='local_distilled_runtime_canary_started'
      and s.evidence->>'reservationOnly'='true'
      and s.observed_at > v_now - interval '8 minutes'
      and not exists (
        select 1
        from public.cos_university_learning_assurance_events t
        where t.event_type='fine_tune'
          and t.candidate_id=s.candidate_id
          and t.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
          and t.evidence->>'artifactHash'=s.evidence->>'artifactHash'
          and t.evidence->>'claim' in (
            'local_distilled_runtime_canary_preflight_failed',
            'local_distilled_runtime_canary_passed',
            'local_distilled_runtime_canary_failed'
          )
          and t.evidence->>'reservationEventKey'=s.event_key
          and t.observed_at >= s.observed_at
      )
  ) then
    return;
  end if;

  for v_artifact in
    select a.*
    from public.cos_local_distillation_artifacts a
    where a.status='evaluation_pending'
      and a.candidate_id like 'mass:%'
      and a.trained_artifact_hash ~ '^[a-f0-9]{64}$'
      and a.revision_key ~ '^[a-f0-9]{64}$'
      and length(btrim(coalesce(a.trained_artifact_id,''))) > 0
      and coalesce(a.evidence_ref,'') ~ '^hf://models/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[a-f0-9]{40}    order by a.created_at asc, a.candidate_id asc
  loop
    select e.* into v_control
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.verifier='host_controller'
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.evidence->>'claim' in (
        'local_distilled_runtime_deploy_approved',
        'local_distilled_runtime_canary_suspended'
      )
    order by e.observed_at desc, e.event_key desc
    limit 1
    for update;

    if not found then continue; end if;

    v_residency_completed_at := null;
    if pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.coalesce(v_artifact.subject_id,'')), '[^a-z0-9]+', '_', 'g')
      in ('computer_science','computer_science_coding') then
      select max(r.completed_at) into v_residency_completed_at
      from public.cos_university_residency_enrollments r
      where r.candidate_id=v_artifact.candidate_id
        and r.trained_artifact_hash=v_artifact.trained_artifact_hash
        and r.program_id='builder-computer-science-v1'
        and r.standing='residency_complete'
        and r.completed_at is not null;
      if v_residency_completed_at is null then continue; end if;
      if v_control.observed_at < v_residency_completed_at then continue; end if;
    end if;

    v_evidence := v_control.evidence;
    if v_evidence->>'claim' <> 'local_distilled_runtime_deploy_approved' then continue; end if;
    if jsonb_typeof(v_evidence->'canaryAuthorized') <> 'boolean'
      or jsonb_typeof(v_evidence->'productionTrafficAuthorized') <> 'boolean'
      or jsonb_typeof(v_evidence->'authorityExpanded') <> 'boolean'
      or jsonb_typeof(v_evidence->'maxCanaryInvocations') <> 'number'
      or jsonb_typeof(v_evidence->'maxEstimatedCanaryCostUsd') <> 'number' then continue; end if;
    if (v_evidence->>'canaryAuthorized')::boolean <> true
      or (v_evidence->>'productionTrafficAuthorized')::boolean <> false
      or (v_evidence->>'authorityExpanded')::boolean <> false then continue; end if;
    if v_control.observed_at > v_now or v_control.expires_at is null or v_control.expires_at <= v_now then continue; end if;

    v_max_invocations := (v_evidence->>'maxCanaryInvocations')::integer;
    v_max_cost := (v_evidence->>'maxEstimatedCanaryCostUsd')::numeric;
    if v_max_invocations <> 1 then continue; end if;
    if v_max_cost <= 0 or v_max_cost > 0.200000 then continue; end if;

    if exists (
      select 1 from public.cos_university_learning_assurance_events e
      where e.event_type='fine_tune'
        and e.candidate_id=v_artifact.candidate_id
        and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
        and e.evidence->>'claim'='local_distilled_runtime_canary_passed'
        and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
        and e.evidence->>'exactArtifact'='true'
        and e.evidence->>'internalVllmReady'='true'
        and (v_residency_completed_at is null or e.observed_at >= v_residency_completed_at)
    ) and not (
      jsonb_typeof(v_evidence->'endpointRefresh')='boolean'
      and (v_evidence->>'endpointRefresh')::boolean=true
    ) then continue; end if;

    -- Only the marker written immediately before the endpoint /ready call consumes the canary.
    select count(*)::integer into v_invocations
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'claim'='local_distilled_runtime_canary_invocation_started'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.observed_at >= v_control.observed_at;
    if v_invocations >= v_max_invocations then continue; end if;

    select count(*)::integer into v_preflight_failures
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'claim'='local_distilled_runtime_canary_preflight_failed'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.observed_at >= v_control.observed_at;
    if v_preflight_failures >= 3 then continue; end if;

    select count(*)::integer into v_reservations
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'claim'='local_distilled_runtime_canary_started'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.observed_at >= v_control.observed_at;

    v_reservation := jsonb_build_object(
      'profile','cos_local_distilled_runtime_deploy_v1',
      'claim','local_distilled_runtime_canary_started',
      'candidateId',v_artifact.candidate_id,
      'artifactHash',v_artifact.trained_artifact_hash,
      'attemptOrdinal',v_invocations+1,
      'preflightOrdinal',v_reservations+1,
      'maxCanaryInvocations',v_max_invocations,
      'maxPreflightFailures',3,
      'maxEstimatedCanaryCostUsd',round(v_max_cost,6),
      'authorizationObservedAt',v_control.observed_at,
      'reservationOnly',true,
      'providerInvocationStarted',false,
      'productionTrafficAuthorized',false,
      'authorityExpanded',false
    );
    v_evidence_hash := encode(extensions.digest(convert_to(v_reservation::text,'UTF8'),'sha256'),'hex');
    v_event_key := encode(extensions.digest(convert_to(
      'mass-distilled-canary-reservation:'||v_artifact.candidate_id||':'||v_artifact.trained_artifact_hash||':'||v_control.observed_at::text||':'||(v_reservations+1)::text,
      'UTF8'),'sha256'),'hex');

    insert into public.cos_university_learning_assurance_events (
      event_key,event_type,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at,expires_at
    ) values (
      v_event_key,'fine_tune',v_artifact.subject_id,v_artifact.candidate_id,
      v_evidence_hash,v_reservation,'host_controller',v_now,v_now+interval '8 minutes'
    ) on conflict (event_key) do nothing;
    if not found then return; end if;

    return query select
      v_artifact.candidate_id,
      v_artifact.subject_id,
      v_artifact.trained_artifact_id,
      v_artifact.trained_artifact_hash,
      v_artifact.revision_key,
      v_artifact.evidence_ref,
      v_control.observed_at,
      v_max_invocations,
      round(v_max_cost,6),
      v_event_key;
    return;
  end loop;
end;
$$;

revoke all on function public.claim_next_mass_distilled_runtime_canary()
  from public, anon, authenticated;
grant execute on function public.claim_next_mass_distilled_runtime_canary() to service_role;
      and (
        pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.coalesce(a.subject_id,'')), '[^a-z0-9]+', '_', 'g')
          not in ('computer_science','computer_science_coding')
        or exists (
          select 1 from public.cos_university_residency_enrollments r
          where r.candidate_id=a.candidate_id
            and r.trained_artifact_hash=a.trained_artifact_hash
            and r.program_id='builder-computer-science-v1'
            and r.standing='residency_complete'
            and r.completed_at is not null
        )
      )
    order by a.created_at asc, a.candidate_id asc
  loop
    select e.* into v_control
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.verifier='host_controller'
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.evidence->>'claim' in (
        'local_distilled_runtime_deploy_approved',
        'local_distilled_runtime_canary_suspended'
      )
    order by e.observed_at desc, e.event_key desc
    limit 1
    for update;

    if not found then continue; end if;
    v_evidence := v_control.evidence;
    if v_evidence->>'claim' <> 'local_distilled_runtime_deploy_approved' then continue; end if;
    if jsonb_typeof(v_evidence->'canaryAuthorized') <> 'boolean'
      or jsonb_typeof(v_evidence->'productionTrafficAuthorized') <> 'boolean'
      or jsonb_typeof(v_evidence->'authorityExpanded') <> 'boolean'
      or jsonb_typeof(v_evidence->'maxCanaryInvocations') <> 'number'
      or jsonb_typeof(v_evidence->'maxEstimatedCanaryCostUsd') <> 'number' then continue; end if;
    if (v_evidence->>'canaryAuthorized')::boolean <> true
      or (v_evidence->>'productionTrafficAuthorized')::boolean <> false
      or (v_evidence->>'authorityExpanded')::boolean <> false then continue; end if;
    if v_control.observed_at > v_now or v_control.expires_at is null or v_control.expires_at <= v_now then continue; end if;

    v_max_invocations := (v_evidence->>'maxCanaryInvocations')::integer;
    v_max_cost := (v_evidence->>'maxEstimatedCanaryCostUsd')::numeric;
    if v_max_invocations <> 1 then continue; end if;
    if v_max_cost <= 0 or v_max_cost > 0.200000 then continue; end if;

    if exists (
      select 1 from public.cos_university_learning_assurance_events e
      where e.event_type='fine_tune'
        and e.candidate_id=v_artifact.candidate_id
        and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
        and e.evidence->>'claim'='local_distilled_runtime_canary_passed'
        and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
        and e.evidence->>'exactArtifact'='true'
        and e.evidence->>'internalVllmReady'='true'
    ) and not (
      jsonb_typeof(v_evidence->'endpointRefresh')='boolean'
      and (v_evidence->>'endpointRefresh')::boolean=true
    ) then continue; end if;

    -- Only the marker written immediately before the endpoint /ready call consumes the canary.
    select count(*)::integer into v_invocations
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'claim'='local_distilled_runtime_canary_invocation_started'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.observed_at >= v_control.observed_at;
    if v_invocations >= v_max_invocations then continue; end if;

    select count(*)::integer into v_preflight_failures
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'claim'='local_distilled_runtime_canary_preflight_failed'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.observed_at >= v_control.observed_at;
    if v_preflight_failures >= 3 then continue; end if;

    select count(*)::integer into v_reservations
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.evidence->>'profile'='cos_local_distilled_runtime_deploy_v1'
      and e.evidence->>'claim'='local_distilled_runtime_canary_started'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.observed_at >= v_control.observed_at;

    v_reservation := jsonb_build_object(
      'profile','cos_local_distilled_runtime_deploy_v1',
      'claim','local_distilled_runtime_canary_started',
      'candidateId',v_artifact.candidate_id,
      'artifactHash',v_artifact.trained_artifact_hash,
      'attemptOrdinal',v_invocations+1,
      'preflightOrdinal',v_reservations+1,
      'maxCanaryInvocations',v_max_invocations,
      'maxPreflightFailures',3,
      'maxEstimatedCanaryCostUsd',round(v_max_cost,6),
      'authorizationObservedAt',v_control.observed_at,
      'reservationOnly',true,
      'providerInvocationStarted',false,
      'productionTrafficAuthorized',false,
      'authorityExpanded',false
    );
    v_evidence_hash := encode(extensions.digest(convert_to(v_reservation::text,'UTF8'),'sha256'),'hex');
    v_event_key := encode(extensions.digest(convert_to(
      'mass-distilled-canary-reservation:'||v_artifact.candidate_id||':'||v_artifact.trained_artifact_hash||':'||v_control.observed_at::text||':'||(v_reservations+1)::text,
      'UTF8'),'sha256'),'hex');

    insert into public.cos_university_learning_assurance_events (
      event_key,event_type,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at,expires_at
    ) values (
      v_event_key,'fine_tune',v_artifact.subject_id,v_artifact.candidate_id,
      v_evidence_hash,v_reservation,'host_controller',v_now,v_now+interval '8 minutes'
    ) on conflict (event_key) do nothing;
    if not found then return; end if;

    return query select
      v_artifact.candidate_id,
      v_artifact.subject_id,
      v_artifact.trained_artifact_id,
      v_artifact.trained_artifact_hash,
      v_artifact.revision_key,
      v_artifact.evidence_ref,
      v_control.observed_at,
      v_max_invocations,
      round(v_max_cost,6),
      v_event_key;
    return;
  end loop;
end;
$$;

revoke all on function public.claim_next_mass_distilled_runtime_canary()
  from public, anon, authenticated;
grant execute on function public.claim_next_mass_distilled_runtime_canary() to service_role;