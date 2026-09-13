-- saas/supabase/migrations/20260912170000_university_masters_execution_binding.sql
-- Extends the execution binding to the Master's exam ledger.
--
-- The undergraduate lanes — independent exams, A-range, retention, generalist capstone — all bind a
-- specialist's evidence to the executor that produced it. `cos_university_masters_exam_runs` has no
-- such column, so the moment a registered specialist can sit graduate work its evidence would be
-- indistinguishable from COS's. This closes that before the runner becomes agent-aware, not after.
--
-- Identical in shape to the generalised undergraduate binding: provenance must name the run's own
-- agent, run id, turn, manifest and model, carry three SHA-256 hashes, declare no academic
-- authority, and match the recorded response_source. COS keeps NULL provenance and is unaffected;
-- the constraint is NOT VALID so no historical graduate evidence is revalidated.
-- Run through Hub -> Run Migration. Re-runnable.

alter table public.cos_university_masters_exam_runs
  add column if not exists execution_provenance jsonb;

do $masters$
begin
  if to_regclass('public.cos_university_masters_exam_runs') is null then return; end if;

  alter table public.cos_university_masters_exam_runs
    drop constraint if exists cos_university_masters_execution_binding_v1;

  alter table public.cos_university_masters_exam_runs
    add constraint cos_university_masters_execution_binding_v1 check (
      (execution_provenance is null and (agent_id = 'cos' or fresh_execution is not true))
      or (
        execution_provenance is not null and agent_id <> 'cos'
        and (jsonb_typeof(execution_provenance) = 'object'
          and execution_provenance->>'runtime' ~ '^university_[a-z][a-z_]{2,60}_v1$'
          and execution_provenance->>'role' in (
            'software_engineering','cybersecurity','quantitative_data_science',
            'enterprise_operations_governance','scientific_physical_systems','aerospace_nuclear_safety',
            'molecular_biomedical_sciences','neuroscience_biophysics','actuarial_insurance_risk',
            'quantum_theoretical_physics')
          and execution_provenance->>'agentId' = agent_id
          and execution_provenance->>'runId' = id::text
          and execution_provenance->>'turnId' = turn_id
          and execution_provenance->>'manifestHash' = manifest_hash
          and length(btrim(execution_provenance->>'model')) > 0
          and execution_provenance->>'promptHash' ~ '^[a-f0-9]{64}$'
          and execution_provenance->>'responseHash' ~ '^[a-f0-9]{64}$'
          and execution_provenance->>'contextHash' ~ '^[a-f0-9]{64}$'
          and execution_provenance->>'academicAuthority' = 'none'
          and response_source = execution_provenance->>'runtime'
          and local_model_invoked is true and external_ai_invoked is false
        ) is true
      )
    ) not valid;
  -- The comment lives inside this block on purpose. The migration bridge executes the whole file as
  -- one statement batch, so every top-level statement is PARSED before any of them RUNS; a top-level
  -- `comment on column` naming a column this file is still about to add fails at parse time.
  execute $c$comment on column public.cos_university_masters_exam_runs.execution_provenance is
    'Host execution binding for graduate work: learner, registered role, run, trace, model, input/output hashes. Not a self-score or degree.'$c$;
end
$masters$
