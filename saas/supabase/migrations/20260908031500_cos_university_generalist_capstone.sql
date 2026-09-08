create table if not exists public.cos_university_generalist_capstone_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  agent_id text not null default 'cos',
  profile text not null,
  scorer_version text not null,
  seed text not null,
  manifest_hash text not null,
  variant_hash text not null,
  status text not null default 'created' check (status in ('created','running','passed','failed','error')),
  passed boolean,
  turn_id uuid,
  response_source text,
  local_model_invoked boolean not null default false,
  external_ai_invoked boolean not null default false,
  fresh_execution boolean not null default false,
  reasons jsonb not null default '[]'::jsonb,
  latency_ms integer,
  started_at timestamptz,
  completed_at timestamptz,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cos_university_generalist_capstone_terminal_boundary check (
    (status in ('created','running','error') and passed is null)
    or (status = 'passed' and passed is true)
    or (status = 'failed' and passed is false)
  )
);

create index if not exists cos_university_generalist_capstone_agent_observed_idx
  on public.cos_university_generalist_capstone_runs (agent_id, observed_at desc);

create index if not exists cos_university_generalist_capstone_variant_idx
  on public.cos_university_generalist_capstone_runs (agent_id, variant_hash)
  where passed is true;

alter table public.cos_university_generalist_capstone_runs enable row level security;
revoke all on table public.cos_university_generalist_capstone_runs from anon, authenticated;
grant select, insert, update, delete on table public.cos_university_generalist_capstone_runs to service_role;

comment on table public.cos_university_generalist_capstone_runs is
  'Host-controlled COS University generalist graduation capstone evidence. Graduation itself is derived from current fresh transcript evidence and is not stored here.';
comment on column public.cos_university_generalist_capstone_runs.seed is
  'Server-owned seed used to regenerate and verify the hidden capstone manifest; raw prompt/rubric/reply are not stored.';
