-- COS University deliberate practice: harden the canonical cognitive practice-result RPC.
-- When the claimed queue row is University-origin, the function locks and validates the exact
-- study-plan round in the SAME transaction before it mutates the practice queue/experience/skill.
-- A terminal University failure also atomically versions/reopens the study plan so an accepted-study
-- write that began before the failure cannot commit afterward with stale pre-failure evidence.
-- Non-University cognitive practice keeps the pre-existing behavior unchanged.

create or replace function public.cos_record_cognitive_practice_result(
  p_queue_id uuid,
  p_success boolean,
  p_score double precision,
  p_answer text,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.cos_active_practice_queue%rowtype;
  next_attempt integer;
  next_status text;
  now_at timestamptz := now();
  skill_snapshot jsonb;
  university_plan_id uuid;
  university_practice_round integer;
  university_plan public.cos_university_study_plans%rowtype;
  university_proof jsonb;
  university_remediation jsonb;
  university_proof_observed_at timestamptz;
begin
  if p_score < 0 or p_score > 1 then
    raise exception 'score_out_of_range';
  end if;

  select * into q
  from public.cos_active_practice_queue
  where id = p_queue_id
  for update;

  if q.id is null then
    raise exception 'practice_item_not_found';
  end if;
  if q.status <> 'running' then
    raise exception 'practice_item_not_running';
  end if;

  -- University practice receives an additional transactional fence. Reading the identifiers from
  -- the locked queue row prevents a caller from substituting a different plan/round. Holding the
  -- study-plan row lock until this function returns serializes accepted-study/remediation updates
  -- against the result commit and closes the post-inference TOCTOU window.
  if q.metadata->>'origin' = 'cos_university_deliberate_practice' then
    if q.generation_source <> 'curated' then
      raise exception 'university_practice_generation_source_invalid';
    end if;

    begin
      university_plan_id := (q.metadata->>'universityPlanId')::uuid;
    exception when others then
      raise exception 'university_practice_plan_id_invalid';
    end;

    if coalesce(q.metadata->>'practiceRound', '') !~ '^[1-9][0-9]*$' then
      raise exception 'university_practice_round_invalid';
    end if;
    university_practice_round := (q.metadata->>'practiceRound')::integer;

    select * into university_plan
    from public.cos_university_study_plans
    where id = university_plan_id
      and agent_id = 'cos'
    for update;

    if university_plan.id is null
       or university_plan.status <> 'studying'
       or university_plan.attempt_count <> university_practice_round then
      raise exception 'university_practice_plan_round_fence_failed';
    end if;

    if not exists (
      select 1
      from jsonb_array_elements(university_plan.methods) as method
      where method->>'id' = 'deliberate_practice'
        and method->>'execution' = 'automatic_if_certifiable'
    ) then
      raise exception 'university_practice_method_fence_failed';
    end if;

    university_proof := coalesce(university_plan.evidence->'studyProof', '{}'::jsonb);
    if university_proof->>'studyAttempt' <> university_practice_round::text
       or university_proof->>'source' <> 'continuous_learning_accepted_gap'
       or university_proof->'academicCredit' is distinct from 'false'::jsonb
       or jsonb_typeof(university_proof->'evidenceRefs') is distinct from 'array' then
      raise exception 'university_practice_study_proof_fence_failed';
    end if;
    if jsonb_array_length(university_proof->'evidenceRefs') < 1 then
      raise exception 'university_practice_study_proof_evidence_required';
    end if;

    if university_plan.last_attempt_at is null
       or nullif(university_proof->>'observedAt', '') is null then
      raise exception 'university_practice_study_proof_timestamp_missing';
    end if;
    begin
      university_proof_observed_at := (university_proof->>'observedAt')::timestamptz;
    exception when others then
      raise exception 'university_practice_study_proof_timestamp_invalid';
    end;
    if university_proof_observed_at is distinct from university_plan.last_attempt_at then
      raise exception 'university_practice_study_proof_timestamp_mismatch';
    end if;

    university_remediation := coalesce(university_plan.evidence->'practiceRemediation', '{}'::jsonb);
    if university_remediation->>'practiceRound' = university_practice_round::text
       and university_remediation->'requiresNewStudyAttempt' = 'true'::jsonb then
      raise exception 'university_practice_restudy_required';
    end if;
  end if;

  next_attempt := q.attempt_count + 1;
  next_status := case
    when p_success then 'passed'
    when next_attempt >= q.max_attempts then 'failed'
    else 'queued'
  end;

  -- A terminal University failure is itself the authoritative causal boundary for restudy.
  -- Version and mark the already-locked plan before the transaction can release it. Therefore a
  -- proof writer that selected the pre-failure updated_at must fail its optimistic UPDATE after
  -- waiting for this lock, while later accepted study may legitimately create the next attempt.
  if university_plan_id is not null and next_status = 'failed' then
    update public.cos_university_study_plans
    set status = 'studying',
        last_attempt_at = null,
        evidence = coalesce(evidence, '{}'::jsonb) || jsonb_build_object(
          'practiceRemediation', jsonb_build_object(
            'practiceRound', university_practice_round,
            'failureReasons', jsonb_build_array(coalesce(p_evidence->>'reason', 'evaluation_failed')),
            'requestedAt', now_at,
            'requiresNewStudyAttempt', true,
            'requiresIndependentRetest', true,
            'academicCredit', false,
            'reconciledAcrossRuntimeBoundary', false
          )
        ),
        updated_at = now_at
    where id = university_plan_id
      and agent_id = 'cos'
      and status = 'studying'
      and attempt_count = university_practice_round;

    if not found then
      raise exception 'university_practice_failure_remediation_fence_failed';
    end if;
  end if;

  update public.cos_active_practice_queue
  set attempt_count = next_attempt,
      status = next_status,
      last_score = p_score,
      last_error = case when p_success then null else coalesce(p_evidence->>'reason','evaluation_failed') end,
      completed_at = case when next_status in ('passed','failed') then now_at else null end,
      next_attempt_at = case when next_status = 'queued' then now_at + interval '15 minutes' else next_attempt_at end,
      updated_at = now_at
  where id = q.id;

  insert into public.cos_cognitive_experiences(
    experience_hash, subject, experience_kind, skill_key, variant_key,
    source_kind, source_ref, success, score, evidence,
    first_observed_at, last_observed_at, updated_at
  )
  select
    'practice_queue:' || q.id::text || ':' || next_attempt::text,
    s.subject,
    q.exercise_kind,
    q.skill_key,
    q.variant_key,
    q.generation_source,
    'cos_active_practice_queue:' || q.id::text,
    p_success,
    p_score,
    jsonb_build_object(
      'answer', left(coalesce(p_answer,''), 12000),
      'rubric', q.rubric,
      'evaluation', coalesce(p_evidence,'{}'::jsonb),
      'exerciseKind', q.exercise_kind,
      'generationSource', q.generation_source,
      'teacherLessonId', q.teacher_lesson_id
    ),
    now_at, now_at, now_at
  from public.cos_cognitive_skills s
  where s.skill_key = q.skill_key
  on conflict (experience_hash) do nothing;

  update public.cos_cognitive_skills
  set practice_attempts = practice_attempts + case when q.exercise_kind = 'practice' then 1 else 0 end,
      practice_successes = practice_successes + case when q.exercise_kind = 'practice' and p_success then 1 else 0 end,
      holdout_attempts = holdout_attempts + case when q.exercise_kind = 'holdout' then 1 else 0 end,
      holdout_successes = holdout_successes + case when q.exercise_kind = 'holdout' and p_success then 1 else 0 end,
      distinct_holdout_variants = distinct_holdout_variants + case when q.exercise_kind = 'holdout' and q.attempt_count = 0 then 1 else 0 end,
      failure_count = failure_count + case when p_success then 0 else 1 end,
      last_practiced_at = now_at,
      last_validated_at = case when q.exercise_kind = 'holdout' and p_success then now_at else last_validated_at end,
      updated_at = now_at
  where skill_key = q.skill_key;

  select jsonb_build_object(
    'skillKey', skill_key,
    'status', status,
    'evaluatorApproved', evaluator_approved,
    'understandingApproved', understanding_approved,
    'practiceAttempts', practice_attempts,
    'practiceSuccesses', practice_successes,
    'holdoutAttempts', holdout_attempts,
    'holdoutSuccesses', holdout_successes,
    'distinctHoldoutVariants', distinct_holdout_variants,
    'productionAttempts', production_attempts,
    'productionSuccesses', production_successes,
    'failureCount', failure_count,
    'lastValidatedAt', last_validated_at,
    'quarantined', quarantined_at is not null
  ) into skill_snapshot
  from public.cos_cognitive_skills
  where skill_key = q.skill_key;

  return jsonb_build_object(
    'queueId', q.id,
    'queueStatus', next_status,
    'attemptCount', next_attempt,
    'skill', skill_snapshot
  );
end;
$$;

comment on function public.cos_record_cognitive_practice_result(uuid, boolean, double precision, text, jsonb) is
  'Canonical cognitive practice recorder. University-origin rows are transactionally fenced against the exact accepted-study plan/round; terminal failures atomically version/reopen that plan before result commit.';
