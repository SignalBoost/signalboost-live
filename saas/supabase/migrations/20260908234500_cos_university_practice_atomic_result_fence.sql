-- COS University deliberate practice: atomically validate the exact study plan/round
-- before recording a cognitive practice result. The generic cognitive recorder remains
-- authoritative for queue/experience/skill mutation; this wrapper holds both row locks
-- in the same transaction so a study-plan advance cannot race between validation and commit.

create or replace function public.cos_record_university_cognitive_practice_result(
  p_queue_id uuid,
  p_plan_id uuid,
  p_practice_round integer,
  p_success boolean,
  p_score double precision,
  p_answer text,
  p_evidence jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  q public.cos_active_practice_queue%rowtype;
  plan_row public.cos_university_study_plans%rowtype;
  proof jsonb;
  remediation jsonb;
  proof_observed_at timestamptz;
begin
  if p_practice_round < 1 then
    raise exception 'university_practice_round_invalid';
  end if;

  -- Lock the exact claimed queue row first. The delegated generic recorder reuses this
  -- lock later in the same transaction.
  select * into q
  from public.cos_active_practice_queue
  where id = p_queue_id
  for update;

  if q.id is null then
    raise exception 'university_practice_item_not_found';
  end if;
  if q.status <> 'running' then
    raise exception 'university_practice_item_not_running';
  end if;
  if q.generation_source <> 'curated'
     or q.metadata->>'origin' <> 'cos_university_deliberate_practice'
     or q.metadata->>'universityPlanId' <> p_plan_id::text
     or q.metadata->>'practiceRound' <> p_practice_round::text then
    raise exception 'university_practice_queue_fence_failed';
  end if;

  -- Hold the plan row lock until the generic recorder finishes. Any learning/remediation
  -- update that would change attempt_count/evidence must therefore serialize after this
  -- practice result or win before these checks.
  select * into plan_row
  from public.cos_university_study_plans
  where id = p_plan_id
    and agent_id = 'cos'
  for update;

  if plan_row.id is null
     or plan_row.status <> 'studying'
     or plan_row.attempt_count <> p_practice_round then
    raise exception 'university_practice_plan_round_fence_failed';
  end if;

  proof := coalesce(plan_row.evidence->'studyProof', '{}'::jsonb);
  if proof->>'studyAttempt' <> p_practice_round::text
     or proof->>'source' <> 'continuous_learning_accepted_gap'
     or proof->'academicCredit' is distinct from 'false'::jsonb
     or jsonb_typeof(proof->'evidenceRefs') is distinct from 'array'
     or jsonb_array_length(proof->'evidenceRefs') < 1 then
    raise exception 'university_practice_study_proof_fence_failed';
  end if;

  if plan_row.last_attempt_at is null or nullif(proof->>'observedAt', '') is null then
    raise exception 'university_practice_study_proof_timestamp_missing';
  end if;
  begin
    proof_observed_at := (proof->>'observedAt')::timestamptz;
  exception when others then
    raise exception 'university_practice_study_proof_timestamp_invalid';
  end;
  if proof_observed_at is distinct from plan_row.last_attempt_at then
    raise exception 'university_practice_study_proof_timestamp_mismatch';
  end if;

  remediation := coalesce(plan_row.evidence->'practiceRemediation', '{}'::jsonb);
  if remediation->>'practiceRound' = p_practice_round::text
     and remediation->'requiresNewStudyAttempt' = 'true'::jsonb then
    raise exception 'university_practice_restudy_required';
  end if;

  return public.cos_record_cognitive_practice_result(
    p_queue_id,
    p_success,
    p_score,
    p_answer,
    coalesce(p_evidence, '{}'::jsonb)
  );
end;
$$;

revoke all on function public.cos_record_university_cognitive_practice_result(uuid, uuid, integer, boolean, double precision, text, jsonb) from public;
revoke all on function public.cos_record_university_cognitive_practice_result(uuid, uuid, integer, boolean, double precision, text, jsonb) from anon, authenticated;
grant execute on function public.cos_record_university_cognitive_practice_result(uuid, uuid, integer, boolean, double precision, text, jsonb) to service_role;

comment on function public.cos_record_university_cognitive_practice_result(uuid, uuid, integer, boolean, double precision, text, jsonb) is
  'Service-only atomic University practice recorder. Locks the claimed queue row and exact study-plan round, validates accepted-study proof/remediation, then delegates to the canonical cognitive practice recorder in the same transaction.';
