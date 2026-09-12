create table if not exists public.a2a_specialist_qualifications (
  qualification_key text primary key,
  tenant_id text not null,
  environment_id text not null,
  portable_id text not null,
  agent_id text not null,
  skill_id text not null,
  qualified boolean not null,
  evidence_ref text not null,
  verified_by text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint a2a_specialist_qualification_scope_nonempty check (
    length(trim(tenant_id)) > 0 and length(trim(environment_id)) > 0 and length(trim(portable_id)) > 0 and
    length(trim(agent_id)) > 0 and length(trim(skill_id)) > 0 and length(trim(verified_by)) > 0
  ),
  constraint a2a_specialist_qualification_evidence check (qualified = false or length(trim(evidence_ref)) > 0),
  constraint a2a_specialist_qualification_window check (valid_until > valid_from)
);

create index if not exists a2a_specialist_qualifications_lookup_idx
  on public.a2a_specialist_qualifications (tenant_id, environment_id, portable_id, skill_id, agent_id, observed_at desc);

create table if not exists public.a2a_specialist_mesh_telemetry (
  event_key text primary key,
  tenant_id text not null,
  environment_id text not null,
  portable_id text not null,
  agent_id text not null,
  skill_id text not null,
  available boolean,
  latency_score numeric(6,3),
  cost_score numeric(6,3),
  load_score numeric(6,3),
  reliability_score numeric(6,3),
  quality_score numeric(6,3),
  source_ref text not null,
  observed_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint a2a_specialist_mesh_telemetry_scope_nonempty check (
    length(trim(tenant_id)) > 0 and length(trim(environment_id)) > 0 and length(trim(portable_id)) > 0 and
    length(trim(agent_id)) > 0 and length(trim(skill_id)) > 0 and length(trim(source_ref)) > 0
  ),
  constraint a2a_specialist_mesh_telemetry_window check (expires_at > observed_at),
  constraint a2a_specialist_mesh_latency_score check (latency_score is null or latency_score between 0 and 100),
  constraint a2a_specialist_mesh_cost_score check (cost_score is null or cost_score between 0 and 100),
  constraint a2a_specialist_mesh_load_score check (load_score is null or load_score between 0 and 100),
  constraint a2a_specialist_mesh_reliability_score check (reliability_score is null or reliability_score between 0 and 100),
  constraint a2a_specialist_mesh_quality_score check (quality_score is null or quality_score between 0 and 100)
);

create index if not exists a2a_specialist_mesh_telemetry_lookup_idx
  on public.a2a_specialist_mesh_telemetry (tenant_id, environment_id, portable_id, skill_id, agent_id, observed_at desc);

alter table public.a2a_specialist_qualifications enable row level security;
alter table public.a2a_specialist_mesh_telemetry enable row level security;

comment on table public.a2a_specialist_qualifications is
  'Host-owned specialist qualification decisions. Assignment and Agent Card metadata never qualify an agent.';
comment on table public.a2a_specialist_mesh_telemetry is
  'Read-only routing evidence for already authorized and qualified specialist candidates. Telemetry never grants authority.';
