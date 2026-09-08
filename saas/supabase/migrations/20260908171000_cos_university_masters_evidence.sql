create table if not exists public.cos_university_masters_evidence (
  id uuid primary key default gen_random_uuid(),
  evidence_key text not null,
  agent_id text not null default 'cos',
  program_key text not null,
  program_id text not null check (program_id in (
    'applied_ai_systems','security_and_trust','quantitative_decision_science',
    'enterprise_operations_and_governance','scientific_and_physical_systems'
  )),
  stage text not null check (stage in (
    'graduate_coursework','independent_specialist_exam','cross_domain_transfer',
    'verified_practical_work','masters_capstone'
  )),
  passed boolean not null,
  variant_hash text not null check (length(btrim(variant_hash)) > 0),
  independent boolean not null default false,
  verified_practical boolean not null default false,
  authority text not null check (authority in (
    'university_coursework','host_private_exam','verified_production','host_capstone'
  )),
  source_ref text not null check (length(btrim(source_ref)) > 0),
  scorer_version text,
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  evidence_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (agent_id, evidence_key),
  constraint cos_university_masters_program_identity check (
    program_key = 'specialist_masters_' || program_id || '_v1'
  ),
  constraint cos_university_masters_evidence_time_order check (observed_at < valid_until),
  constraint cos_university_masters_authority_stage check (
    (stage = 'graduate_coursework' and authority = 'university_coursework')
    or (stage in ('independent_specialist_exam','cross_domain_transfer') and authority = 'host_private_exam')
    or (stage = 'verified_practical_work' and authority = 'verified_production' and verified_practical = true)
    or (stage = 'masters_capstone' and authority = 'host_capstone')
  ),
  constraint cos_university_masters_independence check (
    stage = 'graduate_coursework' or independent = true
  )
);

create index if not exists cos_university_masters_evidence_program_idx
  on public.cos_university_masters_evidence (agent_id, program_key, stage, observed_at desc);

alter table public.cos_university_masters_evidence enable row level security;
revoke all on table public.cos_university_masters_evidence from anon, authenticated, service_role;
grant select, insert on table public.cos_university_masters_evidence to service_role;

create or replace function public.cos_university_masters_evidence_immutable_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception 'cos_university_masters_evidence is immutable';
end;
$$;

revoke all on function public.cos_university_masters_evidence_immutable_guard() from public;

drop trigger if exists cos_university_masters_evidence_immutable on public.cos_university_masters_evidence;
create trigger cos_university_masters_evidence_immutable
before update or delete on public.cos_university_masters_evidence
for each row execute function public.cos_university_masters_evidence_immutable_guard();

comment on table public.cos_university_masters_evidence is
  'Immutable host-controlled Master''s evidence. Stores verdict/provenance metadata only; no raw exam prompt, hidden rubric, learner reply, or caller-supplied degree flag.';
