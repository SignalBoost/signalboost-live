-- COS University PhD runtime: host identity, research-need, project, and evidence ledgers.
-- These tables store academic control/evidence metadata only. They do not expose hidden exam
-- prompts/rubrics or grant any execution authority.

create table if not exists public.cos_university_phd_actor_identities (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null unique check (length(btrim(actor_id)) > 0),
  actor_role text not null check (actor_role in (
    'candidate','researcher','experiment_evaluator','replicator','replication_panel',
    'peer_reviewer','dissertation_committee','methodology_examiner','literature_panel',
    'hypothesis_committee','faculty','system'
  )),
  principal_type text not null check (principal_type in ('ai_model','human','service','system')),
  principal_fingerprint text not null check (length(btrim(principal_fingerprint)) > 0),
  source_ref text not null check (length(btrim(source_ref)) > 0),
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  created_at timestamptz not null default now(),
  constraint cos_university_phd_actor_identity_time check (valid_from < valid_until)
);

create index if not exists cos_university_phd_actor_principal_idx
  on public.cos_university_phd_actor_identities (principal_fingerprint, valid_from desc);

create table if not exists public.cos_university_phd_research_needs (
  id uuid primary key default gen_random_uuid(),
  need_key text not null unique check (length(btrim(need_key)) > 0),
  agent_id text not null default 'cos',
  program_id text not null check (program_id in (
    'ai_systems_research','security_trust_research','quantitative_methods_research',
    'enterprise_systems_research','physical_systems_research'
  )),
  justified boolean not null,
  reason_code text not null check (reason_code in (
    'repeated_unresolved_failure','frontier_capability_gap','replication_required',
    'production_research_need','owner_research_directive','organizational_research_value'
  )),
  source_ref text not null check (length(btrim(source_ref)) > 0),
  host_authority text not null default 'university_research_strategy'
    check (host_authority = 'university_research_strategy'),
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cos_university_phd_research_need_time check (observed_at < valid_until)
);

create index if not exists cos_university_phd_research_need_idx
  on public.cos_university_phd_research_needs (agent_id, program_id, observed_at desc);

create table if not exists public.cos_university_phd_projects (
  id uuid primary key default gen_random_uuid(),
  project_key text not null unique check (length(btrim(project_key)) > 0),
  agent_id text not null default 'cos',
  program_key text not null,
  program_id text not null check (program_id in (
    'ai_systems_research','security_trust_research','quantitative_methods_research',
    'enterprise_systems_research','physical_systems_research'
  )),
  candidate_actor_id text not null check (length(btrim(candidate_actor_id)) > 0),
  research_project_id text not null check (length(btrim(research_project_id)) > 0),
  protocol_id text not null check (length(btrim(protocol_id)) > 0),
  research_objective text not null check (length(btrim(research_objective)) > 0),
  source_ref text not null check (length(btrim(source_ref)) > 0),
  opened_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (agent_id, program_key, research_project_id, protocol_id),
  constraint cos_university_phd_project_program_identity check (
    program_key = 'specialist_phd_' || program_id || '_v1'
  )
);

create index if not exists cos_university_phd_project_idx
  on public.cos_university_phd_projects (agent_id, program_key, opened_at desc);

create table if not exists public.cos_university_phd_evidence (
  id uuid primary key default gen_random_uuid(),
  evidence_key text not null unique check (length(btrim(evidence_key)) > 0),
  evidence_id text not null unique check (length(btrim(evidence_id)) > 0),
  agent_id text not null default 'cos',
  program_key text not null,
  program_id text not null check (program_id in (
    'ai_systems_research','security_trust_research','quantitative_methods_research',
    'enterprise_systems_research','physical_systems_research'
  )),
  stage text not null check (stage in (
    'research_methodology_exam','primary_literature_synthesis','hypothesis_proposal',
    'preregistered_experiment','independent_replication','peer_critique_defense',
    'dissertation_defense'
  )),
  research_project_id text not null check (length(btrim(research_project_id)) > 0),
  protocol_id text not null check (length(btrim(protocol_id)) > 0),
  candidate_actor_id text not null check (length(btrim(candidate_actor_id)) > 0),
  performer_actor_ids text[] not null check (cardinality(performer_actor_ids) > 0),
  evaluator_actor_ids text[] not null check (cardinality(evaluator_actor_ids) > 0),
  identity_provenance text not null default 'host_identity_ledger'
    check (identity_provenance = 'host_identity_ledger'),
  parent_evidence_ids text[] not null default '{}'::text[],
  passed boolean not null,
  variant_hash text not null check (length(btrim(variant_hash)) > 0),
  independent boolean not null default true check (independent = true),
  authority text not null check (authority in (
    'host_private_exam','primary_literature_panel','research_committee','verified_experiment',
    'independent_replication_panel','peer_review_panel','dissertation_committee'
  )),
  primary_source_count integer,
  protocol_frozen boolean,
  reproducible_artifact_hash text,
  replicated_artifact_hash text,
  independent_replication boolean,
  critique_resolved boolean,
  novelty_judged_independent boolean,
  source_ref text not null check (length(btrim(source_ref)) > 0),
  scorer_version text,
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cos_university_phd_evidence_program_identity check (
    program_key = 'specialist_phd_' || program_id || '_v1'
  ),
  constraint cos_university_phd_evidence_time check (observed_at < valid_until),
  constraint cos_university_phd_stage_authority check (
    (stage = 'research_methodology_exam' and authority = 'host_private_exam')
    or (stage = 'primary_literature_synthesis' and authority = 'primary_literature_panel')
    or (stage = 'hypothesis_proposal' and authority = 'research_committee')
    or (stage = 'preregistered_experiment' and authority = 'verified_experiment')
    or (stage = 'independent_replication' and authority = 'independent_replication_panel')
    or (stage = 'peer_critique_defense' and authority = 'peer_review_panel')
    or (stage = 'dissertation_defense' and authority = 'dissertation_committee')
  )
);

create index if not exists cos_university_phd_evidence_program_idx
  on public.cos_university_phd_evidence (agent_id, program_key, stage, observed_at desc);
create index if not exists cos_university_phd_evidence_lineage_idx
  on public.cos_university_phd_evidence (agent_id, program_key, research_project_id, protocol_id, observed_at);

alter table public.cos_university_phd_actor_identities enable row level security;
alter table public.cos_university_phd_research_needs enable row level security;
alter table public.cos_university_phd_projects enable row level security;
alter table public.cos_university_phd_evidence enable row level security;

revoke all on table public.cos_university_phd_actor_identities from anon, authenticated, service_role;
revoke all on table public.cos_university_phd_research_needs from anon, authenticated, service_role;
revoke all on table public.cos_university_phd_projects from anon, authenticated, service_role;
revoke all on table public.cos_university_phd_evidence from anon, authenticated, service_role;

grant select, insert on table public.cos_university_phd_actor_identities to service_role;
grant select, insert on table public.cos_university_phd_research_needs to service_role;
grant select, insert on table public.cos_university_phd_projects to service_role;
grant select, insert on table public.cos_university_phd_evidence to service_role;

create or replace function public.cos_university_phd_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'COS University PhD academic ledgers are immutable';
end;
$$;
revoke all on function public.cos_university_phd_immutable_guard() from public;

drop trigger if exists cos_university_phd_actor_immutable on public.cos_university_phd_actor_identities;
create trigger cos_university_phd_actor_immutable
before update or delete on public.cos_university_phd_actor_identities
for each row execute function public.cos_university_phd_immutable_guard();

drop trigger if exists cos_university_phd_need_immutable on public.cos_university_phd_research_needs;
create trigger cos_university_phd_need_immutable
before update or delete on public.cos_university_phd_research_needs
for each row execute function public.cos_university_phd_immutable_guard();

drop trigger if exists cos_university_phd_project_immutable on public.cos_university_phd_projects;
create trigger cos_university_phd_project_immutable
before update or delete on public.cos_university_phd_projects
for each row execute function public.cos_university_phd_immutable_guard();

drop trigger if exists cos_university_phd_evidence_immutable on public.cos_university_phd_evidence;
create trigger cos_university_phd_evidence_immutable
before update or delete on public.cos_university_phd_evidence
for each row execute function public.cos_university_phd_immutable_guard();

comment on table public.cos_university_phd_actor_identities is
  'Immutable host identity ledger for PhD candidate/faculty/evaluator principals. New model/principal versions receive new actor IDs.';
comment on table public.cos_university_phd_research_needs is
  'Immutable host justification that a PhD-level research program is valuable; model self-declaration cannot open enrollment.';
comment on table public.cos_university_phd_projects is
  'Immutable PhD research lineage roots binding a program to one candidate, project, and protocol.';
comment on table public.cos_university_phd_evidence is
  'Immutable host-controlled PhD evidence metadata. No browser academic writes, raw hidden exam prompt, rubric, or degree flag.';
