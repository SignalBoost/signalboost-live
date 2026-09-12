-- saas/supabase/migrations/verify/20260912_university_cycle_progress_check.sql
-- SELECT-shaped, read-only. Run after the practice cron has ticked. Shows whether the accepted study
-- attempt carried through to practice and then to a fresh independent exam. The practice queue has no
-- agent column: the learner is the host-written fence in metadata.agentId.
select jsonb_build_object(
  'practice_queue', (
    select coalesce(jsonb_agg(row order by row->>'updated_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'agent_id', q.metadata->>'agentId',
        'university_plan_id', q.metadata->>'universityPlanId',
        'practice_round', q.metadata->>'practiceRound',
        'skill_key', q.skill_key,
        'exercise_kind', q.exercise_kind,
        'status', q.status,
        'attempt_count', q.attempt_count,
        'last_score', q.last_score,
        'last_error', left(coalesce(q.last_error, ''), 200),
        'updated_at', q.updated_at
      ) as row
      from public.cos_active_practice_queue q
      order by q.updated_at desc
      limit 12
    ) practice
  ),
  'exam_runs', (
    select coalesce(jsonb_agg(row order by row->>'created_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'agent_id', e.agent_id,
        'run_key', e.run_key,
        'status', e.status,
        'passed', e.passed,
        'fresh_execution', e.fresh_execution,
        'response_source', e.response_source,
        'local_model_invoked', e.local_model_invoked,
        'external_ai_invoked', e.external_ai_invoked,
        'execution_bound', (e.execution_provenance is not null),
        'reasons', e.reasons,
        'created_at', e.created_at,
        'completed_at', e.completed_at
      ) as row
      from public.cos_university_exam_runs e
      order by e.created_at desc
      limit 10
    ) exams
  ),
  'recent_study_attempts', (
    select coalesce(jsonb_agg(row order by row->>'last_attempt_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'agent_id', p.agent_id,
        'plan_key', p.plan_key,
        'attempt_count', p.attempt_count,
        'last_attempt_at', p.last_attempt_at,
        'study_proof_observed_at', p.evidence->'studyProof'->>'observedAt',
        'remediation_requires_new_study', p.evidence->'practiceRemediation'->>'requiresNewStudyAttempt'
      ) as row
      from public.cos_university_study_plans p
      where p.last_attempt_at > now() - interval '6 hours'
      order by p.last_attempt_at desc
      limit 10
    ) attempts
  )
) as university_cycle_progress
