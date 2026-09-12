-- saas/supabase/migrations/verify/20260912_university_learning_block_diagnostics.sql
-- SELECT-shaped, read-only. Run in the SQL editor and paste the single JSON cell back.
-- Answers the two questions item 2 cannot answer from code: WHY the last acquisition runs accepted
-- zero documents (the per-reason counts the cycle records but nothing surfaces), and WHICH causal
-- boundary is holding each practice plan in restudy. Counts and keys only — no study text, no
-- prompts, no rubrics, no grades.
select jsonb_build_object(
  'acquisition_runs', (
    select coalesce(jsonb_agg(run order by run->>'started_at' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'slot_key', r.slot_key,
        'status', r.status,
        'started_at', r.started_at,
        'planned', r.planned_count,
        'eligible', r.eligible_count,
        'gaps', r.gap_count,
        'documents_acquired', r.documents_acquired,
        'accepted', r.accepted_count,
        'probationary', r.probationary_count,
        'plans_attempted', r.plans_attempted,
        'rejected_counts', r.rejected_counts,
        'source_errors', r.source_errors,
        'gap_diagnostics', r.gap_diagnostics,
        'errors', r.errors
      ) as run
      from public.cos_university_continuous_runs r
      order by r.started_at desc
      limit 12
    ) recent
  ),
  'study_plans', (
    select coalesce(jsonb_agg(plan order by plan->>'priority' desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'agent_id', p.agent_id,
        'plan_key', p.plan_key,
        'status', p.status,
        'priority', p.priority,
        'source_kind', p.source_kind,
        'attempt_count', p.attempt_count,
        'last_attempt_at', p.last_attempt_at,
        'updated_at', p.updated_at,
        'has_deliberate_practice', (
          select count(*) > 0 from jsonb_array_elements(
            case when jsonb_typeof(p.methods) = 'array' then p.methods else '[]'::jsonb end) m
          where m->>'id' = 'deliberate_practice' and m->>'execution' = 'automatic_if_certifiable'),
        'study_proof_attempt', p.evidence->'studyProof'->>'studyAttempt',
        'study_proof_observed_at', p.evidence->'studyProof'->>'observedAt',
        'study_proof_ref_count', coalesce(jsonb_array_length(
          case when jsonb_typeof(p.evidence->'studyProof'->'evidenceRefs') = 'array'
               then p.evidence->'studyProof'->'evidenceRefs' else '[]'::jsonb end), 0),
        'remediation_round', p.evidence->'practiceRemediation'->>'practiceRound',
        'remediation_requires_new_study', p.evidence->'practiceRemediation'->>'requiresNewStudyAttempt',
        'remediation_requested_at', p.evidence->'practiceRemediation'->>'requestedAt'
      ) as plan
      from public.cos_university_study_plans p
      where p.status = 'studying' and p.attempt_count > 0
      order by p.priority desc, p.last_attempt_at desc nulls last
      limit 12
    ) plans
  ),
  'runs_last_7_days', (
    select count(*) from public.cos_university_continuous_runs where started_at > now() - interval '7 days')
) as university_learning_block_diagnostics
