create table if not exists public.cos_university_agent_registry (
  agent_id text primary key,
  role text not null check (role in (
    'chief_of_staff_generalist','software_engineering','cybersecurity',
    'quantitative_data_science','enterprise_operations_governance','scientific_physical_systems',
    'aerospace_nuclear_safety','molecular_biomedical_sciences','neuroscience_biophysics',
    'actuarial_insurance_risk','quantum_theoretical_physics'
  )),
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cos_university_agent_registry enable row level security;
revoke all on table public.cos_university_agent_registry from anon, authenticated;
grant select, insert, update on table public.cos_university_agent_registry to service_role;

insert into public.cos_university_agent_registry (agent_id, role, assigned_by)
values ('cos', 'chief_of_staff_generalist', 'host_bootstrap')
on conflict (agent_id) do nothing;

comment on table public.cos_university_agent_registry is
  'Host-controlled durable AI identity-to-University-role binding. Role selects curriculum only and grants no authority.';
