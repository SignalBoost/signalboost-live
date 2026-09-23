-- Builder Residency -> final canary/evaluation handoff.
--
-- Computer Science & Coding artifacts are trained students while Residency is active.
-- They may enter the exact-artifact final canary and independent evaluation lanes only after
-- durable completion of the exact candidate+artifact Residency enrollment. Older pre-Residency
-- canary evidence cannot satisfy the final gate. Other subjects retain their existing flow.
--
-- This migration changes eligibility only. It does not widen canary/evaluation authority,
-- spend ceilings, promotion, rollback, graduation, or Production traffic authority.

-- Forward repair: allow a policy-authorized endpoint refresh to re-canary an exact artifact that
-- passed an older canary. Ordinary historical passes still block duplicate canaries. Existing
-- one-invocation, <=$0.20, three-preflight-failure and no-Production-traffic limits remain unchanged.
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
      and (
        a.subject_id <> 'Computer Science & Coding'
        or exists (
          select 1
          from public.cos_university_residency_enrollments r
          where r.candidate_id=a.candidate_id
            and r.trained_artifact_hash=a.trained_artifact_hash
            and r.standing='residency_complete'
            and r.completed_at is not null
            and r.authority_expanded=false
        )
      )
      and a.trained_artifact_hash ~ '^[a-f0-9]{64}$'
      and a.revision_key ~ '^[a-f0-9]{64}$'
      and length(btrim(coalesce(a.trained_artifact_id,''))) > 0
      and coalesce(a.evidence_ref,'') ~ '^hf://models/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+@[a-f0-9]{40}$'
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
        and (
          v_artifact.subject_id <> 'Computer Science & Coding'
          or e.observed_at >= (
            select max(r.completed_at)
            from public.cos_university_residency_enrollments r
            where r.candidate_id=v_artifact.candidate_id
              and r.trained_artifact_hash=v_artifact.trained_artifact_hash
              and r.standing='residency_complete'
              and r.completed_at is not null
              and r.authority_expanded=false
          )
        )
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

-- Forward repair: prioritize the first two confirmed response-anchor v2 Computer Science artifacts for
-- independent evaluation after the full 12-hour retention delay. The historical frontier profile is shared
-- by old-recipe artifacts and already has many durable results, so its four-result proof quota no longer
-- protects the Builder apprenticeship cohort. This changes scheduling only: four-way concurrency, exact
-- canary binding, spend ceilings, retry budgets, evaluator scoring, promotion, rollback and Production
-- traffic authority are unchanged.

-- Forward repair: define frontier proof by durable evaluation results, not reservation starts.
-- Production 2026-09-20 produced four frontier starts but only one evaluation row; three starts ended
-- in RunPod readiness infrastructure failures. Those failures must remain retryable and frontier-prioritized.

-- Forward repair: ensure the bounded frontier proof cohort can actually consume evaluator slots.
-- #2661 prioritizes frontier approval issuance, but the atomic claim still ordered every artifact oldest-first,
-- so existing legacy approvals could occupy all four evaluator reservations indefinitely.
-- Preserve the four-way concurrency ceiling and every existing canary, identity, retention, spend and traffic gate.
-- A reservation start is not a proof result: RunPod readiness can fail before any evaluator output exists.
-- Until four frontier artifacts have durable independent-evaluation rows, claim frontier artifacts first;
-- afterward resume normal oldest-first ordering across the whole eligible queue.

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
  v_active_reservations integer := 0;
  v_frontier_completions integer := 0;
  v_builder_v2_completions integer := 0;
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
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mass-distilled-independent-evaluation-global', 0)
  );

  select count(*)::integer into v_active_reservations
  from public.cos_university_learning_assurance_events s
  where s.event_type='fine_tune'
    and s.candidate_id like 'mass:%'
    and s.evidence->>'profile'='cos_mass_distilled_independent_evaluation_runtime_v1'
    and s.evidence->>'claim'='mass_distilled_independent_evaluation_started'
    and s.evidence->>'reservationOnly'='true'
    and s.observed_at > v_now - interval '12 minutes'
    and not exists (
      select 1
      from public.cos_university_learning_assurance_events t
      where t.event_type='fine_tune'
        and t.candidate_id=s.candidate_id
        and t.evidence->>'profile'='cos_mass_distilled_independent_evaluation_runtime_v1'
        and t.evidence->>'artifactHash'=s.evidence->>'artifactHash'
        and t.evidence->>'claim' in (
          'mass_distilled_independent_evaluation_completed',
          'mass_distilled_independent_evaluation_failed'
        )
        and t.observed_at >= s.observed_at
    );

  if v_active_reservations >= 4 then return; end if;

  select count(distinct r.candidate_id)::integer into v_builder_v2_completions
  from public.cos_university_distilled_evaluation_runs r
  join public.cos_local_distillation_artifacts a
    on a.candidate_id=r.candidate_id
  where r.candidate_id like 'mass:%'
    and a.subject_id='Computer Science & Coding'
    and a.intended_use #>> '{trainingReceipt,optimizer}'='frontier_response_anchor_then_stable_on_policy_distillation'
    and a.intended_use #>> '{trainingReceipt,frontierResponseAnchorRequired}'='true'
    and case
      when jsonb_typeof(a.intended_use #> '{trainingReceipt,frontierResponseAnchorEpochs}')='number'
      then (a.intended_use #>> '{trainingReceipt,frontierResponseAnchorEpochs}')::numeric
      else 0
    end=1
    and case
      when jsonb_typeof(a.intended_use #> '{trainingReceipt,frontierResponseAnchorItems}')='number'
      then (a.intended_use #>> '{trainingReceipt,frontierResponseAnchorItems}')::numeric
      else 0
    end>0;

  select count(distinct r.candidate_id)::integer into v_frontier_completions
  from public.cos_university_distilled_evaluation_runs r
  join public.cos_local_distillation_artifacts a
    on a.candidate_id=r.candidate_id
  where r.candidate_id like 'mass:%'
    and a.intended_use #>> '{trainingReceipt,profile}'='cos_university_frontier_gkd_v1';

  for v_artifact in
    select a.*
    from public.cos_local_distillation_artifacts a
    where a.status='evaluation_pending'
      and a.candidate_id like 'mass:%'
      and (
        a.subject_id <> 'Computer Science & Coding'
        or exists (
          select 1
          from public.cos_university_residency_enrollments r
          where r.candidate_id=a.candidate_id
            and r.trained_artifact_hash=a.trained_artifact_hash
            and r.standing='residency_complete'
            and r.completed_at is not null
            and r.authority_expanded=false
        )
      )
      and a.created_at <= v_now - interval '12 hours'
      and a.trained_artifact_hash ~ '^[a-f0-9]{64}$'
      and a.revision_key ~ '^[a-f0-9]{64}$'
      and a.dataset_hash ~ '^[a-f0-9]{64}$'
    order by
      case
        when v_builder_v2_completions < 2
          and a.subject_id='Computer Science & Coding'
          and a.intended_use #>> '{trainingReceipt,optimizer}'='frontier_response_anchor_then_stable_on_policy_distillation'
          and a.intended_use #>> '{trainingReceipt,frontierResponseAnchorRequired}'='true'
          and case
            when jsonb_typeof(a.intended_use #> '{trainingReceipt,frontierResponseAnchorEpochs}')='number'
            then (a.intended_use #>> '{trainingReceipt,frontierResponseAnchorEpochs}')::numeric
            else 0
          end=1
          and case
            when jsonb_typeof(a.intended_use #> '{trainingReceipt,frontierResponseAnchorItems}')='number'
            then (a.intended_use #>> '{trainingReceipt,frontierResponseAnchorItems}')::numeric
            else 0
          end>0
        then 0 else 1
      end,
      case
        when v_frontier_completions < 4
          and a.intended_use #>> '{trainingReceipt,profile}'='cos_university_frontier_gkd_v1'
        then 0 else 1
      end,
      a.created_at asc,
      a.candidate_id asc
  loop
    select e.* into v_control
    from public.cos_university_learning_assurance_events e
    where e.event_type='fine_tune'
      and e.candidate_id=v_artifact.candidate_id
      and e.verifier='host_controller'
      and e.evidence->>'profile'='cos_distilled_independent_evaluation_authorization_v1'
      and e.evidence->>'artifactHash'=v_artifact.trained_artifact_hash
      and e.evidence->>'claim' in (
        'distilled_independent_evaluation_approved',
        'distilled_independent_evaluation_suspended'
      )
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
      or jsonb_typeof(v_evidence->'maxEstimatedRuntimeWakeCostUsd')<>'number'
    then continue; end if;

    if (v_evidence->>'evaluationAuthorized')::boolean<>true
      or (v_evidence->>'productionTrafficAuthorized')::boolean<>false
      or (v_evidence->>'authorityExpanded')::boolean<>false
    then continue; end if;

    if v_control.observed_at>v_now
      or v_control.expires_at is null
      or v_control.expires_at<=v_now
    then continue; end if;

    v_max_endpoint:=(v_evidence->>'maxEndpointCalls')::integer;
    v_max_judge:=(v_evidence->>'maxJudgeCalls')::integer;
    v_max_wake:=(v_evidence->>'maxRuntimeWakeAttempts')::integer;
    v_max_cost:=(v_evidence->>'maxEstimatedRuntimeWakeCostUsd')::numeric;

    if v_max_endpoint<>18
      or v_max_judge<>4
      or v_max_wake<>1
      or v_max_cost<=0
      or v_max_cost>0.200000
    then continue; end if;

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
      and (
        v_artifact.subject_id <> 'Computer Science & Coding'
        or e.observed_at >= (
          select max(r.completed_at)
          from public.cos_university_residency_enrollments r
          where r.candidate_id=v_artifact.candidate_id
            and r.trained_artifact_hash=v_artifact.trained_artifact_hash
            and r.standing='residency_complete'
            and r.completed_at is not null
            and r.authority_expanded=false
        )
      )
    order by e.observed_at desc
    limit 1;

    if not found then continue; end if;

    if exists (
      select 1
      from public.cos_university_learning_assurance_events e
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

    v_evidence_hash:=encode(
      extensions.digest(convert_to(v_reservation::text,'UTF8'),'sha256'),
      'hex'
    );
    v_event_key:=encode(
      extensions.digest(
        convert_to(
          'mass-distilled-evaluation-reservation:'
          ||v_artifact.candidate_id||':'
          ||v_artifact.trained_artifact_hash||':'
          ||v_control.observed_at::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );

    insert into public.cos_university_learning_assurance_events(
      event_key,event_type,subject_id,candidate_id,evidence_hash,evidence,verifier,observed_at,expires_at
    ) values (
      v_event_key,
      'fine_tune',
      v_artifact.subject_id,
      v_artifact.candidate_id,
      v_evidence_hash,
      v_reservation,
      'host_controller',
      v_now,
      v_now+interval '12 minutes'
    )
    on conflict(event_key) do nothing;

    if not found then return; end if;

    return query select
      v_artifact.candidate_id,
      v_artifact.subject_id,
      v_artifact.trained_artifact_id,
      v_artifact.trained_artifact_hash,
      v_artifact.revision_key,
      v_artifact.dataset_hash,
      v_canary.evidence->>'endpointId',
      v_control.observed_at,
      v_max_endpoint,
      v_max_judge,
      v_max_wake,
      round(v_max_cost,6),
      v_event_key;
    return;
  end loop;
end;
$$;

revoke all on function public.claim_next_mass_distilled_evaluation()
  from public, anon, authenticated;
grant execute on function public.claim_next_mass_distilled_evaluation()
  to service_role;

