-- saas/supabase/migrations/20260913201500_university_specialist_runtime_binding.sql
-- Generalize host-owned University execution binding from the first software specialist to every
-- role admitted by cos_university_agent_registry. Historical software evidence keeps its exact
-- runtime string. No historical row, grade, credential, score or academic outcome is rewritten.

create or replace function public.cos_university_specialist_runtime_for_role(p_role text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case p_role
    when 'software_engineering' then 'university_software_specialist_v1'
    when 'cybersecurity' then 'university_cybersecurity_specialist_v1'
    when 'quantitative_data_science' then 'university_quantitative_data_science_specialist_v1'
    when 'enterprise_operations_governance' then 'university_enterprise_operations_governance_specialist_v1'
    when 'scientific_physical_systems' then 'university_scientific_physical_systems_specialist_v1'
    when 'aerospace_nuclear_safety' then 'university_aerospace_nuclear_safety_specialist_v1'
    when 'molecular_biomedical_sciences' then 'university_molecular_biomedical_sciences_specialist_v1'
    when 'neuroscience_biophysics' then 'university_neuroscience_biophysics_specialist_v1'
    when 'actuarial_insurance_risk' then 'university_actuarial_insurance_risk_specialist_v1'
    when 'quantum_theoretical_physics' then 'university_quantum_theoretical_physics_specialist_v1'
    else null
  end
$$;
revoke all on function public.cos_university_specialist_runtime_for_role(text) from public, anon, authenticated;
grant execute on function public.cos_university_specialist_runtime_for_role(text) to service_role;
comment on function public.cos_university_specialist_runtime_for_role(text) is
  'Host role-to-runtime identity map for bound University specialist execution. Grants no academic authority.';

-- Generalist undergraduate capstone.
alter table public.cos_university_generalist_capstone_runs
  drop constraint if exists cos_university_capstone_execution_binding_v1;
alter table public.cos_university_generalist_capstone_runs
  drop constraint if exists cos_university_capstone_execution_binding_v2;
alter table public.cos_university_generalist_capstone_runs
  add constraint cos_university_capstone_execution_binding_v2 check (
    (execution_provenance is null and (agent_id = 'cos' or fresh_execution is not true))
    or (
      execution_provenance is not null and agent_id <> 'cos'
      and (jsonb_typeof(execution_provenance) = 'object'
        and public.cos_university_specialist_runtime_for_role(execution_provenance->>'role') is not null
        and execution_provenance->>'runtime' = public.cos_university_specialist_runtime_for_role(execution_provenance->>'role')
        and execution_provenance->>'agentId' = agent_id
        and execution_provenance->>'runId' = id::text
        and execution_provenance->>'turnId' = turn_id::text
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

-- Independent undergraduate exams.
alter table public.cos_university_exam_runs
  drop constraint if exists cos_university_exam_execution_binding_v1;
alter table public.cos_university_exam_runs
  drop constraint if exists cos_university_exam_execution_binding_v2;
alter table public.cos_university_exam_runs
  add constraint cos_university_exam_execution_binding_v2 check (
    (execution_provenance is null and (agent_id = 'cos' or fresh_execution is not true))
    or (
      execution_provenance is not null and agent_id <> 'cos'
      and (jsonb_typeof(execution_provenance) = 'object'
        and public.cos_university_specialist_runtime_for_role(execution_provenance->>'role') is not null
        and execution_provenance->>'runtime' = public.cos_university_specialist_runtime_for_role(execution_provenance->>'role')
        and execution_provenance->>'agentId' = agent_id
        and execution_provenance->>'runId' = id::text
        and execution_provenance->>'turnId' = turn_id::text
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

-- Subject and language A-range share this ledger.
alter table public.cos_university_a_range_runs
  drop constraint if exists cos_university_a_range_execution_binding_v1;
alter table public.cos_university_a_range_runs
  drop constraint if exists cos_university_a_range_execution_binding_v2;
alter table public.cos_university_a_range_runs
  add constraint cos_university_a_range_execution_binding_v2 check (
    (execution_provenance is null and (agent_id = 'cos' or fresh_execution is not true))
    or (
      execution_provenance is not null and agent_id <> 'cos'
      and (jsonb_typeof(execution_provenance) = 'object'
        and public.cos_university_specialist_runtime_for_role(execution_provenance->>'role') is not null
        and execution_provenance->>'runtime' = public.cos_university_specialist_runtime_for_role(execution_provenance->>'role')
        and execution_provenance->>'agentId' = agent_id
        and execution_provenance->>'runId' = id::text
        and execution_provenance->>'turnId' = turn_id::text
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

-- Delayed retention has no response_source/local/external columns; execution provenance itself is the
-- host-owned binding and its exact role/runtime pair is still enforced.
alter table public.cos_university_retention_runs
  drop constraint if exists cos_university_retention_execution_binding_v1;
alter table public.cos_university_retention_runs
  drop constraint if exists cos_university_retention_execution_binding_v2;
alter table public.cos_university_retention_runs
  add constraint cos_university_retention_execution_binding_v2 check (
    (execution_provenance is null and (agent_id = 'cos' or passed is null))
    or (
      execution_provenance is not null and agent_id <> 'cos'
      and (jsonb_typeof(execution_provenance) = 'object'
        and public.cos_university_specialist_runtime_for_role(execution_provenance->>'role') is not null
        and execution_provenance->>'runtime' = public.cos_university_specialist_runtime_for_role(execution_provenance->>'role')
        and execution_provenance->>'agentId' = agent_id
        and execution_provenance->>'runId' = id::text
        and execution_provenance->>'turnId' = turn_id::text
        and execution_provenance->>'manifestHash' = source_manifest_hash
        and length(btrim(execution_provenance->>'model')) > 0
        and execution_provenance->>'promptHash' ~ '^[a-f0-9]{64}$'
        and execution_provenance->>'responseHash' ~ '^[a-f0-9]{64}$'
        and execution_provenance->>'contextHash' ~ '^[a-f0-9]{64}$'
        and execution_provenance->>'academicAuthority' = 'none'
      ) is true
    )
  ) not valid;

-- Master's exam binding was already role-generic, but make the role/runtime pair exact rather than
-- accepting any syntactically valid specialist runtime for any admitted role.
alter table public.cos_university_masters_exam_runs
  drop constraint if exists cos_university_masters_execution_binding_v1;
alter table public.cos_university_masters_exam_runs
  drop constraint if exists cos_university_masters_execution_binding_v2;
alter table public.cos_university_masters_exam_runs
  add constraint cos_university_masters_execution_binding_v2 check (
    (execution_provenance is null and (agent_id = 'cos' or fresh_execution is not true))
    or (
      execution_provenance is not null and agent_id <> 'cos'
      and (jsonb_typeof(execution_provenance) = 'object'
        and public.cos_university_specialist_runtime_for_role(execution_provenance->>'role') is not null
        and execution_provenance->>'runtime' = public.cos_university_specialist_runtime_for_role(execution_provenance->>'role')
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
