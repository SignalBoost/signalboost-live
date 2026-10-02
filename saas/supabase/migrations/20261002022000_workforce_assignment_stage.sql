-- First-class Workforce stage after University graduation.
-- Permanent graduate identity is preserved; assignments are real work records, not synthetic graduation artifacts.
create table if not exists public.cos_workforce_assignments (
  id uuid primary key default gen_random_uuid(),
  registry_id uuid not null references public.cos_university_graduate_model_registry(id) on delete restrict,
  workforce_roster_id uuid not null references public.cos_workforce_roster(id) on delete restrict,
  permanent_artifact_id uuid not null references public.cos_university_artifact_birth_certificates(permanent_artifact_id) on delete restrict,
  source_kind text not null check (source_kind in ('production_request','production_shadow')),
  source_ref text not null,
  objective_hash text not null check (objective_hash ~ '^[a-f0-9]{64}$'),
  specialty text not null,
  status text not null default 'assigned' check (status in ('assigned','working','completed','failed','remediation')),
  assigned_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  serving_attempt_id uuid,
  outcome_evidence_hash text,
  failure_reason text,
  authority_expanded boolean not null default false check (authority_expanded=false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(registry_id, source_kind, source_ref)
);
create index if not exists cos_workforce_assignments_registry_status_idx
  on public.cos_workforce_assignments(registry_id,status,assigned_at);
alter table public.cos_workforce_assignments enable row level security;
revoke all on public.cos_workforce_assignments from public,anon,authenticated;

create or replace view public.cos_workforce_stage
with (security_invoker=true) as
select
  g.id registry_id,
  b.permanent_artifact_id ai_id,
  g.subject_id,
  g.promoted_at graduated_at,
  w.id workforce_roster_id,
  w.hired_at workforce_entered_at,
  w.status workforce_status,
  a.id assignment_id,
  a.source_kind,
  a.source_ref,
  a.status assignment_status,
  a.assigned_at,
  a.started_at,
  a.completed_at,
  case
    when g.status <> 'active' then 'GRADUATED_HOLD'
    when w.id is null then 'GRADUATED'
    when a.id is null then 'WORKFORCE_AVAILABLE'
    when a.status='assigned' then 'ASSIGNED'
    when a.status='working' then 'WORKING'
    when a.status='completed' then 'PRODUCTION_VERIFIED'
    when a.status in ('failed','remediation') then 'REMEDIATION'
    else 'WORKFORCE_AVAILABLE'
  end workforce_stage
from public.cos_university_graduate_model_registry g
join public.cos_university_artifact_birth_certificates b
  on b.candidate_id=g.candidate_id and b.trained_artifact_hash=g.trained_artifact_hash
left join public.cos_workforce_roster w on w.registry_id=g.id
left join lateral (
  select x.* from public.cos_workforce_assignments x
  where x.registry_id=g.id
  order by x.assigned_at desc limit 1
) a on true;

revoke all on public.cos_workforce_stage from public,anon,authenticated;
grant select on public.cos_workforce_stage to service_role;
comment on view public.cos_workforce_stage is
  'Post-University employment lifecycle: GRADUATED -> WORKFORCE_AVAILABLE -> ASSIGNED -> WORKING -> PRODUCTION_VERIFIED or REMEDIATION.';
