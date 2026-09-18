-- Keep the atomic mass-evaluation claim contract aligned with the shared 14-call evaluator ceiling.
-- #2460 raised the application-side endpoint-call authority from 8 to 14; this migration updates the
-- database gate without changing judge, wake, cost, exact-artifact, or Production-traffic boundaries.
create or replace function public.claim_next_mass_distilled_evaluation()
returns table (
  candidate_id text,
  subject_id text,
  artifact_id text,
  artifact_hash text,
  revision_key text,
  dataset_hash text,
  endpoint_id text,
  approval_observed_at timestamptz,
  max_endpoint_calls integer,
  max_judge_calls integer,
  max_runtime_wake_attempts integer,
  max_estimated_runtime_wake_cost_usd numeric,
  reservation_event_key text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_artifact public.cos_local_distillation_artifacts%rowtype;
  v_control public.cos_university_learning_assurance_events%rowtype;
  v_canary public.cos_university_learning_assurance_events%rowtype;
  v_evidence jsonb;
  v_now timestamptz := clock_timestamp();
  v_max_endpoint integer;
  v_max_judge integer;
  v_max_wake integer;
  v_max_cost numeric;
  v_event_key text;
  v_evidence_hash text;
  v_reservation jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('mass-distilled-independent-evaluation-global', 0));

  if exists (
    select 1 from public.cos_university_learning_assurance_events s
    where s.event_type='fine_tune'
      and s.candidate_id like 'mass:%'
      and s.evidence->>'profile'='cos_mass_distilled_independent_evaluation_runtime_v1'
      and s.evidence->>'claim'='mass_distilled_independent_evaluation_started'
      and s.evidence->>'reservationOnly'='true'
      and s.observed_at > v_now - interval '12 minutes'
      and not exists (
        select 1 from public.cos_university_learning_assurance_events t
        where t.event_type='fine_tune'
          and t.candidate_id=s.candidate_id
          and t.evidence->>'profile'='cos_mass_distilled_independent_evaluation_runtime_v1'
          and t.evidence->>'artifactHash'=s.evidence->>'artifactHash'
          and t.evidence->>'claim' in ('mass_distilled_independent_evaluation_completed','mass_distilled_independent_evaluation_failed')
          and t.observed_at >= s.observed_at
      )
  ) then return; end if;

  for v_artifact in
    select a.* from public.cos_local_distillation_artifacts a
    where a.status='evaluation_pending'
      and a.candidate_id like 'mass:%'
      and a.created_at <= v_now - interval '12 hours'
      and a.trained_artifact_hash ~ '^[a-f0-9]{64}$'
      and a.revision_key ~ '^[a-f0-9]{64}$'
      and a.dataset_hash ~ '^[a-f0-9]{64}$'
    order by a.created_at asc, a.candidate_id asc
  loop
    select e.* into v_control
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.verifier='host_controller'
      and e.evidence->>'profile'='cos_distilled_independent_evaluation_authorization_v1'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.evidence->>'claim' in ('distilled_independent_evaluation_approved','distilled_independent_evaluation_suspended')
    order by e.observed_at desc, e.event_key desc
    limit 1
    for update;
    if not found then continue; end if;

    v_evidence:=v_control.evidence;
    if v_evidence->>'claim'<>'distilled_independent_evaluation_approved' then continue; end if;
    if jsonb_typeof(v_evidence->'evaluationAuthorized')<>'boolean'
      or jsonb_typeof(v_evidence->'productionTrafficAuthorized')<>'boolean'
      or jsonb_typeof(v_evidence->'authorityExpanded')<>'boolean'
      or jsonb_typeof(v_evidence->'maxEndpointCalls')<>'number'
      or jsonb_typeof(v_evidence->'maxJudgeCalls')<>'number'
      or jsonb_typeof(v_evidence->'maxRuntimeWakeAttempts')<>'number'
      or jsonb_typeof(v_evidence->'maxEstimatedRuntimeWakeCostUsd')<>'number' then continue; end if;
    if (v_evidence->>'evaluationAuthorized')::boolean<>true
      or (v_evidence->>'productionTrafficAuthorized')::boolean<>false
      or (v_evidence->>'authorityExpanded')::boolean<>false then continue; end if;
    if v_control.observed_at>v_now or v_control.expires_at is null or v_control.expires_at<=v_now then continue; end if;

    v_max_endpoint:=(v_evidence->>'maxEndpointCalls')::integer;
    v_max_judge:=(v_evidence->>'maxJudgeCalls')::integer;
    v_max_wake:=(v_evidence->>'maxRuntimeWakeAttempts')::integer;
    v_max_cost:=(v_evidence->>'maxEstimatedRuntimeWakeCostUsd')::numeric;
    if v_max_endpoint<>14 or v_max_judge<>4 or v_max_wake<>1 or v_max_cost<=0 or v_max_cost>0.200000 then continue; end if;

    select e.* into v_canary
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.verifier='host_production_verifier'
      and e.evidence->>'profile'='cos_university_fine_tune_evidence_v1'
      and e.evidence->>'claim'='production_canary_healthy'
      and e.evidence->>'trainedArtifactId'=v_artifact.trained_artifact_id
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.evidence->>'revisionKey'=v_artifact.revision_key
      and e.evidence->>'exactArtifact'='true'
      and e.evidence->>'internalVllmReady'='true'
      and e.evidence->>'productionTrafficAuthorized'='false'
      and e.evidence->>'authorityExpanded'='false'
      and length(btrim(coalesce(e.evidence->>'endpointId','')))>0
    order by e.observed_at desc
    limit 1;
    if not found then continue; end if;

    if exists (
      select 1 from public.cos_university_learning_assurance_events e
      where e.event_type='fine_tune'
        and e.candidate_id=v_artifact.candidate_id
        and e.evidence->>'profile'='cos_mass_distilled_independent_evaluation_runtime_v1'
        and e.evidence->>'claim'='mass_distilled_independent_evaluation_started'
        and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
        and e.observed_at>=v_control.observed_at
    ) then continue; end if;

    v_reservation:=jsonb_build_object(
      'profile','cos_mass_distilled_independent_evaluation_runtime_v1',
      'claim','mass_distilled_independent_evaluation_started',
      'candidateId',v_artifact.candidate_id,
      'artifactHash',v_artifact.trained_artifact_hash,
      'revisionKey',v_artifact.revision_key,
      'endpointId',v_canary.evidence->>'endpointId',
      'authorizationObservedAt',v_control.observed_at,
      'maxEndpointCalls',v_max_endpoint,
      'maxJudgeCalls',v_max_judge,
      'maxRuntimeWakeAttempts',v_max_wake,
      'maxEstimatedRuntimeWakeCostUsd',round(v_max_cost,6),
      'reservationOnly',true,
      'productionTrafficAuthorized',false,
      'authorityExpanded',false
    );
    v_evidence_hash:=encode(extensions.digest(convert_to(v_reservation::text,'UTF8'),'sha256'),'hex');
    v_event_key:=encode(extensions.digest(convert_to(
      'mass-distilled-evaluation-reservation:'||v_artifact.candidate_id||':'||v_artifact.trained_artifact_hash||':'||v_control.observed_at::text,
      'UTF8'),'sha256'),'hex');

    insert into public.cos_university_learning_assurance_events(
      event_key,event_type,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at,expires_at
    ) values (
      v_event_key,'fine_tune',v_artifact.subject_id,v_artifact.candidate_id,
      v_evidence_hash,v_reservation,'host_controller',v_now,v_now+interval '12 minutes'
    ) on conflict(event_key) do nothing;
    if not found then return; end if;

    return query select
      v_artifact.candidate_id,v_artifact.subject_id,v_artifact.trained_artifact_id,
      v_artifact.trained_artifact_hash,v_artifact.revision_key,v_artifact.dataset_hash,
      v_canary.evidence->>'endpointId',v_control.observed_at,
      v_max_endpoint,v_max_judge,v_max_wake,round(v_max_cost,6),v_event_key;
    return;
  end loop;
end;
$$;

revoke all on function public.claim_next_mass_distilled_evaluation() from public, anon, authenticated;
grant execute on function public.claim_next_mass_distilled_evaluation() to service_role;
