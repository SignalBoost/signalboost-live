-- COS University PhD research execution.
-- Research work products are deliberately separate from the immutable academic evidence ledger.
-- A submitted work product has academic_credit=false and can only become degree evidence through
-- the existing independent host-controlled PhD evaluation seam.

create table if not exists public.cos_university_phd_work_assignments (
  id uuid primary key default gen_random_uuid(),
  assignment_key text not null unique check (length(btrim(assignment_key)) > 0),
  agent_id text not null default 'cos',
  program_key text not null,
  program_id text not null check (program_id in (
    'ai_systems_research','security_trust_research','quantitative_methods_research',
    'enterprise_systems_research','physical_systems_research'
  )),
  research_project_id text not null check (length(btrim(research_project_id)) > 0),
  protocol_id text not null check (length(btrim(protocol_id)) > 0),
  candidate_actor_id text not null check (length(btrim(candidate_actor_id)) > 0),
  performer_actor_id text not null check (length(btrim(performer_actor_id)) > 0),
  work_kind text not null check (work_kind in (
    'primary_literature_research','hypothesis_development','experiment_protocol_design',
    'independent_replication','peer_review','peer_critique_response',
    'dissertation_synthesis','dissertation_review'
  )),
  academic_stage text not null check (academic_stage in (
    'research_methodology_exam','primary_literature_synthesis','hypothesis_proposal',
    'preregistered_experiment','independent_replication','peer_critique_defense','dissertation_defense'
  )),
  attempt_index integer not null default 0 check (attempt_index >= 0),
  parent_evidence_ids text[] not null default '{}'::text[],
  objective text not null check (length(btrim(objective)) > 0),
  objective_hash text not null check (length(btrim(objective_hash)) > 0),
  source_ref text not null check (length(btrim(source_ref)) > 0),
  assigned_at timestamptz not null,
  not_after timestamptz not null,
  created_at timestamptz not null default now(),
  constraint cos_university_phd_work_assignment_program_identity check (
    program_key = 'specialist_phd_' || program_id || '_v1'
  ),
  constraint cos_university_phd_work_assignment_time check (assigned_at < not_after),
  unique (agent_id, program_key, research_project_id, protocol_id, work_kind, attempt_index)
);

create index if not exists cos_university_phd_work_assignment_idx
  on public.cos_university_phd_work_assignments (agent_id, program_key, academic_stage, assigned_at desc);

create table if not exists public.cos_university_phd_work_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique check (length(btrim(run_key)) > 0),
  assignment_key text not null unique references public.cos_university_phd_work_assignments(assignment_key),
  status text not null default 'created' check (status in ('created','running','submitted','failed')),
  failure_reason text,
  started_at timestamptz,
  claim_expires_at timestamptz,
  completed_at timestamptz,
  turn_id text,
  response_source text,
  local_model_invoked boolean,
  external_ai_invoked boolean,
  semantic_cache boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cos_university_phd_work_run_claim_time check (
    claim_expires_at is null or started_at is null or started_at < claim_expires_at
  )
);

create index if not exists cos_university_phd_work_run_status_idx
  on public.cos_university_phd_work_runs (status, updated_at);

create table if not exists public.cos_university_phd_work_products (
  id uuid primary key default gen_random_uuid(),
  product_key text not null unique check (length(btrim(product_key)) > 0),
  assignment_key text not null unique references public.cos_university_phd_work_assignments(assignment_key),
  actor_id text not null check (length(btrim(actor_id)) > 0),
  content_text text not null check (length(btrim(content_text)) > 0),
  content_hash text not null check (length(btrim(content_hash)) > 0),
  source_ref text not null check (length(btrim(source_ref)) > 0),
  submitted_at timestamptz not null,
  academic_credit boolean not null default false check (academic_credit = false),
  created_at timestamptz not null default now()
);

create index if not exists cos_university_phd_work_product_actor_idx
  on public.cos_university_phd_work_products (actor_id, submitted_at desc);

alter table public.cos_university_phd_work_assignments enable row level security;
alter table public.cos_university_phd_work_runs enable row level security;
alter table public.cos_university_phd_work_products enable row level security;

revoke all on table public.cos_university_phd_work_assignments from anon, authenticated, service_role;
revoke all on table public.cos_university_phd_work_runs from anon, authenticated, service_role;
revoke all on table public.cos_university_phd_work_products from anon, authenticated, service_role;

grant select, insert on table public.cos_university_phd_work_assignments to service_role;
grant select, insert, update on table public.cos_university_phd_work_runs to service_role;
grant select, insert on table public.cos_university_phd_work_products to service_role;

create or replace function public.cos_university_phd_work_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'COS University PhD research assignment/product ledgers are immutable';
end;
$$;
revoke all on function public.cos_university_phd_work_immutable_guard() from public;
revoke all on function public.cos_university_phd_work_immutable_guard() from anon, authenticated, service_role;

drop trigger if exists cos_university_phd_work_assignment_immutable on public.cos_university_phd_work_assignments;
create trigger cos_university_phd_work_assignment_immutable
before update or delete on public.cos_university_phd_work_assignments
for each row execute function public.cos_university_phd_work_immutable_guard();

drop trigger if exists cos_university_phd_work_product_immutable on public.cos_university_phd_work_products;
create trigger cos_university_phd_work_product_immutable
before update or delete on public.cos_university_phd_work_products
for each row execute function public.cos_university_phd_work_immutable_guard();

comment on table public.cos_university_phd_work_assignments is
  'Immutable host-created PhD research work assignments. Work is not academic evidence.';
comment on table public.cos_university_phd_work_runs is
  'Mutable operational execution state for PhD research work. It carries no academic credit.';
comment on table public.cos_university_phd_work_products is
  'Immutable research work products awaiting independent evaluation. academic_credit is permanently false.';
