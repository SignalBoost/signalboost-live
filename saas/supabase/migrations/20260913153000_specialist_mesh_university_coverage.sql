-- Specialist Mesh Phase 6: durable University coverage map and cross-training priorities.
-- This table records education demand only. It cannot grant A2A assignment authority, specialist
-- qualification, credentials, approval, or provider access.

create table if not exists public.a2a_specialist_mesh_university_coverage (
  coverage_key text primary key,
  tenant_id text not null,
  environment_id text not null,
  portable_id text not null,
  skill_id text not null,
  risk text not null check (risk in ('advisory', 'write', 'consequential')),
  target_qualified_count integer not null check (target_qualified_count between 2 and 8),
  authorized_agent_ids jsonb not null default '[]'::jsonb,
  qualified_authorized_agent_ids jsonb not null default '[]'::jsonb,
  qualification_evidence_refs jsonb not null default '{}'::jsonb,
  candidate_agent_id text,
  candidate_role text,
  candidate_authorized boolean,
  university_subject_id text not null,
  priority integer not null check (priority between 1 and 100),
  status text not null check (status in ('covered', 'training_priority', 'authorization_gap', 'unassigned')),
  study_plan_id uuid references public.cos_university_study_plans(id) on delete set null,
  observed_at timestamptz not null,
  resolved_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint specialist_mesh_university_coverage_scope_nonempty check (
    length(trim(coverage_key)) > 0 and length(trim(tenant_id)) > 0 and
    length(trim(environment_id)) > 0 and length(trim(portable_id)) > 0 and
    length(trim(skill_id)) > 0 and length(trim(university_subject_id)) > 0
  ),
  constraint specialist_mesh_university_coverage_authorized_array check (
    jsonb_typeof(authorized_agent_ids) = 'array'
  ),
  constraint specialist_mesh_university_coverage_qualified_array check (
    jsonb_typeof(qualified_authorized_agent_ids) = 'array'
  ),
  constraint specialist_mesh_university_coverage_evidence_object check (
    jsonb_typeof(qualification_evidence_refs) = 'object'
  ),
  constraint specialist_mesh_university_coverage_candidate_shape check (
    (candidate_agent_id is null and candidate_role is null and candidate_authorized is null)
    or
    (candidate_agent_id is not null and length(trim(candidate_agent_id)) > 0 and
     candidate_role is not null and length(trim(candidate_role)) > 0 and candidate_authorized is not null)
  ),
  constraint specialist_mesh_university_coverage_status_consistency check (
    (status = 'covered' and jsonb_array_length(qualified_authorized_agent_ids) >= target_qualified_count and
     candidate_agent_id is null and resolved_at is not null)
    or
    (status <> 'covered' and jsonb_array_length(qualified_authorized_agent_ids) < target_qualified_count and resolved_at is null)
  ),
  constraint specialist_mesh_university_coverage_study_plan_shape check (
    study_plan_id is null or status = 'training_priority'
  )
);

create index if not exists specialist_mesh_university_coverage_status_idx
  on public.a2a_specialist_mesh_university_coverage (status, priority desc, updated_at asc);
create index if not exists specialist_mesh_university_coverage_scope_idx
  on public.a2a_specialist_mesh_university_coverage (tenant_id, environment_id, portable_id, skill_id);

alter table public.a2a_specialist_mesh_university_coverage enable row level security;
revoke all on table public.a2a_specialist_mesh_university_coverage from public, anon, authenticated;
grant select, insert, update on table public.a2a_specialist_mesh_university_coverage to service_role;

comment on table public.a2a_specialist_mesh_university_coverage is
  'Service-role Specialist Mesh capability coverage and University cross-training priorities. Rows are educational evidence only and grant no runtime authority or specialist qualification.';
