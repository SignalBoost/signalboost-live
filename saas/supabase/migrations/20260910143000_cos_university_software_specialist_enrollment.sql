insert into public.cos_university_agent_registry (agent_id, role, assigned_by)
values ('software-specialist', 'software_engineering', 'host_canonical_agent_bootstrap')
on conflict (agent_id) do update
set role = excluded.role,
    assigned_by = excluded.assigned_by,
    updated_at = now();
