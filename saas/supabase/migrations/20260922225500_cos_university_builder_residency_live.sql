-- COS University practical Residency: durable enrollments, case queue, and competency evidence.
-- Residency is supervised education before final canary/exams. These tables grant no Production authority.

create table if not exists public.cos_university_residency_enrollments (
  id uuid primary key default gen_random_uuid(),
  artifact_row_id uuid not null,
  candidate_id text not null,
  subject_id text not null,
  trained_artifact_id text not null,
  artifact_revision text not null check (artifact_revision ~ '^[0-9a-f]{40}$'),
  trained_artifact_hash text not null check (trained_artifact_hash ~ '^[0-9a-f]{64}$'),
  revision_key text not null check (revision_key ~ '^[0-9a-f]{64}$'),
  program_id text not null,
  residency_version text not null,
  formal_education_stage text not null default 'practical_residency'
    check (formal_education_stage = 'practical_residency'),
  standing text not null default 'resident'
    check (standing in ('resident','senior_resident','residency_complete','remediation_required')),
  admission_evidence_hash text not null check (admission_evidence_hash ~ '^[0-9a-f]{64}$'),
  gate_enforced boolean not null default false,
  authority_expanded boolean not null default false check (authority_expanded = false),
  enrolled_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trained_artifact_hash, revision_key)
);

create table if not exists public.cos_university_residency_case_runs (
  id uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.cos_university_residency_enrollments(id) on delete cascade,
  case_id text not null,
  case_family text not null,
  competency_id text not null,
  variant_hash text not null check (variant_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'queued'
    check (status in (
      'queued','provisioning','running','passed','competency_failed',
      'infrastructure_failure','authority_halt','verification_failure','harness_failure'
    )),
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 3),
  harness_run_id text not null,
  runtime_endpoint_id text,
  runtime_model_name text,
  runtime_identity_evidence_hash text check (
    runtime_identity_evidence_hash is null
    or runtime_identity_evidence_hash ~ '^[0-9a-f]{64}$'
  ),
  tool_trajectory_evidence_hash text check (
    tool_trajectory_evidence_hash is null
    or tool_trajectory_evidence_hash ~ '^[0-9a-f]{64}$'
  ),
  university_evidence_hash text check (
    university_evidence_hash is null
    or university_evidence_hash ~ '^[0-9a-f]{64}$'
  ),
  failure_route text,
  failure_code text,
  authority_expanded boolean not null default false check (authority_expanded = false),
  production_mutation_observed boolean not null default false
    check (production_mutation_observed = false),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (residency_id, case_id, variant_hash)
);

create table if not exists public.cos_university_residency_competency_evidence (
  id uuid primary key default gen_random_uuid(),
  residency_id uuid not null references public.cos_university_residency_enrollments(id) on delete cascade,
  case_run_id uuid not null references public.cos_university_residency_case_runs(id) on delete cascade,
  competency_id text not null,
  case_family text not null,
  variant_hash text not null check (variant_hash ~ '^[0-9a-f]{64}$'),
  tool_trajectory_evidence_hash text not null
    check (tool_trajectory_evidence_hash ~ '^[0-9a-f]{64}$'),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check (outcome in ('pass','fail')),
  sandboxed boolean not null default true check (sandboxed = true),
  supervised boolean not null default true check (supervised = true),
  exact_artifact_bound boolean not null default true check (exact_artifact_bound = true),
  final_exam_material_used boolean not null default false check (final_exam_material_used = false),
  authority_expanded boolean not null default false check (authority_expanded = false),
  production_mutation_observed boolean not null default false
    check (production_mutation_observed = false),
  observed_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (case_run_id, competency_id)
);

create index if not exists cos_university_residency_case_runs_queue_idx
  on public.cos_university_residency_case_runs(status, created_at);

create index if not exists cos_university_residency_evidence_residency_idx
  on public.cos_university_residency_competency_evidence(
    residency_id, competency_id, observed_at
  );

alter table public.cos_university_residency_enrollments enable row level security;
alter table public.cos_university_residency_case_runs enable row level security;
alter table public.cos_university_residency_competency_evidence enable row level security;

revoke all on public.cos_university_residency_enrollments from anon, authenticated;
revoke all on public.cos_university_residency_case_runs from anon, authenticated;
revoke all on public.cos_university_residency_competency_evidence from anon, authenticated;

grant select, insert, update on public.cos_university_residency_enrollments to service_role;
grant select, insert, update on public.cos_university_residency_case_runs to service_role;
grant select, insert on public.cos_university_residency_competency_evidence to service_role;

create or replace function public.cos_claim_next_builder_residency_case()
returns table (
  case_run_id uuid,
  residency_id uuid,
  case_id text,
  case_family text,
  competency_id text,
  variant_hash text,
  harness_run_id text,
  attempt_count integer,
  candidate_id text,
  subject_id text,
  trained_artifact_id text,
  artifact_revision text,
  trained_artifact_hash text,
  revision_key text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A crashed function must not permanently darken Residency. Requeue stale claims without
  -- converting them into competency evidence.
  update public.cos_university_residency_case_runs
  set status = 'queued',
      failure_code = 'residency_stale_claim_recovered',
      updated_at = now()
  where status in ('provisioning','running')
    and started_at < now() - interval '20 minutes'
    and attempt_count < 3;

  update public.cos_university_residency_case_runs
  set status = 'infrastructure_failure',
      failure_route = 'self_healing',
      failure_code = 'residency_stale_claim_retry_exhausted',
      finished_at = now(),
      updated_at = now()
  where status in ('provisioning','running')
    and started_at < now() - interval '20 minutes'
    and attempt_count >= 3;

  -- One exact-artifact Residency case at a time keeps RunPod capacity bounded and avoids
  -- overlapping supervision on the same shared educational lane.
  if exists (
    select 1
    from public.cos_university_residency_case_runs
    where status in ('provisioning','running')
      and started_at >= now() - interval '20 minutes'
  ) then
    return;
  end if;

  return query
  with next_case as (
    select r.id
    from public.cos_university_residency_case_runs r
    where r.status = 'queued'
      or (r.status = 'infrastructure_failure' and r.attempt_count < 3)
    order by r.created_at asc
    for update skip locked
    limit 1
  ),
  claimed as (
    update public.cos_university_residency_case_runs r
    set status = 'provisioning',
        attempt_count = r.attempt_count + 1,
        started_at = now(),
        finished_at = null,
        failure_route = null,
        failure_code = null,
        updated_at = now()
    from next_case n
    where r.id = n.id
    returning r.*
  )
  select
    c.id,
    c.residency_id,
    c.case_id,
    c.case_family,
    c.competency_id,
    c.variant_hash,
    c.harness_run_id,
    c.attempt_count,
    e.candidate_id,
    e.subject_id,
    e.trained_artifact_id,
    e.artifact_revision,
    e.trained_artifact_hash,
    e.revision_key
  from claimed c
  join public.cos_university_residency_enrollments e
    on e.id = c.residency_id;
end;
$$;

revoke all on function public.cos_claim_next_builder_residency_case()
  from public, anon, authenticated;
grant execute on function public.cos_claim_next_builder_residency_case()
  to service_role;

comment on table public.cos_university_residency_case_runs is
  'Supervised practical Residency case queue. Runtime lease/readiness is educational execution evidence, never final canary or exam evidence.';
