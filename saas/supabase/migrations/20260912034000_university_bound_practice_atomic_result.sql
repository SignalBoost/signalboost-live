-- Restore the canonical atomic study/result fence for every explicitly identified learner.
-- Supersedes the old COS-only migration and the unfenced function found in Production.
-- No historical row, grade, credential, rubric or admission threshold is rewritten.
create or replace function public.cos_record_cognitive_practice_result(
  p_queue_id uuid, p_success boolean, p_score double precision, p_answer text,
  p_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  q public.cos_active_practice_queue%rowtype;
  next_attempt integer;
  next_status text;
  now_at timestamptz := clock_timestamp();
  skill_snapshot jsonb;
  university_agent_id text;
  university_plan_id uuid;
  university_practice_round integer;
  university_plan public.cos_university_study_plans%rowtype;
  university_proof jsonb;
  university_remediation jsonb;
  proof_observed_at timestamptz;
  execution jsonb;
  execution_started_at timestamptz;
  execution_completed_at timestamptz;
  registered_role text;
  inserted_count integer;
begin
  if p_success is null or p_score is null or p_score < 0 or p_score > 1 then
    raise exception 'practice_result_invalid';
  end if;
  select * into q from public.cos_active_practice_queue where id = p_queue_id for update;
  if q.id is null then raise exception 'practice_item_not_found'; end if;
  if q.status <> 'running' then raise exception 'practice_item_not_running'; end if;

  if q.metadata->>'origin' = 'cos_university_deliberate_practice' then
    if q.generation_source <> 'curated' then
      raise exception 'university_practice_generation_source_invalid';
    end if;
    university_agent_id := q.metadata->>'agentId';
    if university_agent_id is null or university_agent_id !~ '^[a-z0-9][a-z0-9_-]{0,179}$' then
      raise exception 'university_practice_agent_identity_required';
    end if;
    begin
      university_plan_id := (q.metadata->>'universityPlanId')::uuid;
      university_practice_round := (q.metadata->>'practiceRound')::integer;
    exception when others then
      raise exception 'university_practice_plan_identity_invalid';
    end;
    if university_plan_id is null or university_practice_round is null or university_practice_round < 1 then
      raise exception 'university_practice_plan_identity_invalid';
    end if;

    -- Queue identity, not caller-supplied plan ownership, selects and locks the exact study round.
    select * into university_plan from public.cos_university_study_plans
    where id = university_plan_id and agent_id = university_agent_id for update;
    if university_plan.id is null or university_plan.status <> 'studying'
      or university_plan.attempt_count <> university_practice_round then
      raise exception 'university_practice_plan_round_fence_failed';
    end if;
    if not exists (select 1 from jsonb_array_elements(university_plan.methods) as method
      where method->>'id' = 'deliberate_practice' and method->>'execution' = 'automatic_if_certifiable') then
      raise exception 'university_practice_method_fence_failed';
    end if;
    university_proof := coalesce(university_plan.evidence->'studyProof', '{}'::jsonb);
    if university_proof->>'studyAttempt' is distinct from university_practice_round::text
      or university_proof->>'source' is distinct from 'continuous_learning_accepted_gap'
      or university_proof->'academicCredit' is distinct from 'false'::jsonb
      or jsonb_typeof(university_proof->'evidenceRefs') is distinct from 'array' then
      raise exception 'university_practice_study_proof_fence_failed';
    end if;
    if jsonb_array_length(university_proof->'evidenceRefs') < 1
      or exists (select 1 from jsonb_array_elements(university_proof->'evidenceRefs') as ref
        where jsonb_typeof(ref) is distinct from 'string' or length(btrim(ref #>> '{}')) = 0) then
      raise exception 'university_practice_study_proof_evidence_required';
    end if;
    begin
      proof_observed_at := (university_proof->>'observedAt')::timestamptz;
    exception when others then
      raise exception 'university_practice_study_proof_timestamp_invalid';
    end;
    if university_plan.last_attempt_at is null or proof_observed_at is null
      or proof_observed_at is distinct from university_plan.last_attempt_at
      or proof_observed_at > now_at then
      raise exception 'university_practice_study_proof_timestamp_mismatch';
    end if;
    university_remediation := coalesce(university_plan.evidence->'practiceRemediation', '{}'::jsonb);
    if university_remediation->>'practiceRound' = university_practice_round::text
      and university_remediation->'requiresNewStudyAttempt' = 'true'::jsonb then
      raise exception 'university_practice_restudy_required';
    end if;

    if university_agent_id <> 'cos' then
      -- Keep the host identity stable until the transaction commits; unsupported roles fail closed.
      select role into registered_role from public.cos_university_agent_registry
      where agent_id = university_agent_id for share;
      if registered_role is distinct from 'software_engineering'
        or q.metadata->>'executionBinding' is distinct from 'agent_bound_practice_v1' then
        raise exception 'university_practice_registered_executor_required';
      end if;
      perform 1 from public.cos_cognitive_skills
      where skill_key = q.skill_key
        and metadata->>'agentId' = university_agent_id and provenance->>'agentId' = university_agent_id
        and metadata->>'executionBinding' = 'agent_bound_practice_v1'
        and provenance->>'executionBinding' = 'agent_bound_practice_v1'
      for update;
      if not found then raise exception 'university_practice_skill_binding_invalid'; end if;

      execution := p_evidence->'executionProvenance';
      if (jsonb_typeof(execution) = 'object'
        and execution->>'runtime' = 'university_software_specialist_v1'
        and execution->>'role' = registered_role
        and execution->>'agentId' = university_agent_id
        and execution->>'runId' = q.id::text
        and execution->>'turnId' = p_evidence->>'turnId'
        and execution->>'turnId' ~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
        and execution->>'manifestHash' = q.metadata->>'manifestHash'
        and execution->>'manifestHash' ~ '^[a-f0-9]{64}$'
        and execution->>'promptHash' ~ '^[a-f0-9]{64}$'
        and execution->>'responseHash' ~ '^[a-f0-9]{64}$'
        and execution->>'contextHash' ~ '^[a-f0-9]{64}$'
        and length(btrim(execution->>'model')) > 0
        and execution->>'academicAuthority' = 'none'
        and p_evidence->>'responseSource' = 'university_software_specialist_v1'
        and p_evidence->>'origin' = 'cos_university_deliberate_practice'
        and p_evidence->'academicCredit' = 'false'::jsonb) is not true then
        raise exception 'university_practice_execution_binding_invalid';
      end if;
      begin
        execution_started_at := (execution->>'startedAt')::timestamptz;
        execution_completed_at := (execution->>'completedAt')::timestamptz;
      exception when others then
        raise exception 'university_practice_execution_timestamp_invalid';
      end;
      if execution_started_at is null or execution_completed_at is null
        or execution_started_at > execution_completed_at or execution_completed_at > now_at then
        raise exception 'university_practice_execution_timestamp_invalid';
      end if;
    end if;
  end if;

  next_attempt := q.attempt_count + 1;
  next_status := case when p_success then 'passed'
    when next_attempt >= q.max_attempts then 'failed' else 'queued' end;
  if university_plan_id is not null and next_status = 'failed' then
    update public.cos_university_study_plans
    set status = 'studying', last_attempt_at = null,
      evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object('practiceRemediation', jsonb_build_object(
        'practiceRound', university_practice_round,
        'failureReasons', jsonb_build_array(coalesce(p_evidence->>'reason', 'evaluation_failed')),
        'requestedAt', now_at, 'requiresNewStudyAttempt', true, 'requiresIndependentRetest', true,
        'academicCredit', false, 'reconciledAfterTerminalFailure', true, 'reconciledAcrossRuntimeBoundary', false)),
      updated_at = now_at
    where id = university_plan_id and agent_id = university_agent_id
      and status = 'studying' and attempt_count = university_practice_round;
    if not found then raise exception 'university_practice_failure_remediation_fence_failed'; end if;
  end if;

  update public.cos_active_practice_queue
  set attempt_count = next_attempt, status = next_status, last_score = p_score,
    last_error = case when p_success then null else coalesce(p_evidence->>'reason','evaluation_failed') end,
    completed_at = case when next_status in ('passed','failed') then now_at else null end,
    next_attempt_at = case when next_status = 'queued' then now_at + interval '15 minutes' else next_attempt_at end,
    updated_at = now_at where id = q.id;

  insert into public.cos_cognitive_experiences(
    experience_hash, subject, experience_kind, skill_key, variant_key,
    source_kind, source_ref, success, score, evidence, first_observed_at, last_observed_at, updated_at)
  select 'practice_queue:' || q.id::text || ':' || next_attempt::text,
    s.subject, q.exercise_kind, q.skill_key, q.variant_key, q.generation_source,
    'cos_active_practice_queue:' || q.id::text, p_success, p_score,
    jsonb_build_object('answer', left(coalesce(p_answer,''), 12000), 'rubric', q.rubric,
      'evaluation', coalesce(p_evidence,'{}'::jsonb), 'exerciseKind', q.exercise_kind,
      'generationSource', q.generation_source, 'teacherLessonId', q.teacher_lesson_id), now_at, now_at, now_at
  from public.cos_cognitive_skills s where s.skill_key = q.skill_key
  on conflict (experience_hash) do nothing;
  get diagnostics inserted_count = row_count;
  if university_plan_id is not null and inserted_count <> 1 then
    raise exception 'university_practice_experience_not_recorded';
  end if;

  update public.cos_cognitive_skills
  set practice_attempts = practice_attempts + case when q.exercise_kind = 'practice' then 1 else 0 end,
    practice_successes = practice_successes + case when q.exercise_kind = 'practice' and p_success then 1 else 0 end,
    holdout_attempts = holdout_attempts + case when q.exercise_kind = 'holdout' then 1 else 0 end,
    holdout_successes = holdout_successes + case when q.exercise_kind = 'holdout' and p_success then 1 else 0 end,
    distinct_holdout_variants = distinct_holdout_variants + case when q.exercise_kind = 'holdout' and q.attempt_count = 0 then 1 else 0 end,
    failure_count = failure_count + case when p_success then 0 else 1 end,
    last_practiced_at = now_at,
    last_validated_at = case when q.exercise_kind = 'holdout' and p_success then now_at else last_validated_at end,
    updated_at = now_at where skill_key = q.skill_key;

  select jsonb_build_object('skillKey', skill_key, 'status', status,
    'evaluatorApproved', evaluator_approved, 'understandingApproved', understanding_approved,
    'practiceAttempts', practice_attempts, 'practiceSuccesses', practice_successes,
    'holdoutAttempts', holdout_attempts, 'holdoutSuccesses', holdout_successes,
    'distinctHoldoutVariants', distinct_holdout_variants,
    'productionAttempts', production_attempts, 'productionSuccesses', production_successes,
    'failureCount', failure_count, 'lastValidatedAt', last_validated_at,
    'quarantined', quarantined_at is not null) into skill_snapshot
  from public.cos_cognitive_skills where skill_key = q.skill_key;
  return jsonb_build_object('queueId', q.id, 'queueStatus', next_status, 'attemptCount', next_attempt, 'skill', skill_snapshot);
end;
$$;
revoke all on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) from public, anon, authenticated;
grant execute on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) to service_role;
comment on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) is
  'Canonical service-only recorder: exact learner/accepted-study round locked atomically; non-COS execution bound to registered learner; terminal failures reopen study; practice never awards academic credit.';
