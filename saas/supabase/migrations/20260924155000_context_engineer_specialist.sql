-- Register the first-class Context Engineer without granting runtime authority.
-- The role selects curriculum/runtime identity only. Execution, model, tool and repository authority
-- remain governed by their existing independent boundaries.

alter table public.cos_university_agent_registry
  drop constraint if exists cos_university_agent_registry_role_check;

alter table public.cos_university_agent_registry
  add constraint cos_university_agent_registry_role_check check (role in (
    'chief_of_staff_generalist','software_engineering','context_engineering','cybersecurity',
    'quantitative_data_science','enterprise_operations_governance','scientific_physical_systems',
    'aerospace_nuclear_safety','molecular_biomedical_sciences','neuroscience_biophysics',
    'actuarial_insurance_risk','quantum_theoretical_physics'
  )) not valid;

alter table public.cos_university_agent_registry
  validate constraint cos_university_agent_registry_role_check;

create or replace function public.cos_university_specialist_runtime_for_role(p_role text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case p_role
    when 'software_engineering' then 'university_software_specialist_v1'
    when 'context_engineering' then 'university_context_engineering_specialist_v1'
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

insert into public.cos_university_agent_registry (agent_id, role, assigned_by)
values ('context-engineer', 'context_engineering', 'host_canonical_agent_bootstrap')
on conflict (agent_id) do update
set role = excluded.role,
    assigned_by = excluded.assigned_by,
    updated_at = now();

comment on function public.cos_university_specialist_runtime_for_role(text) is
  'Host role-to-runtime identity map for bound University specialist execution, including Context Engineer. Grants no academic or operational authority.';
