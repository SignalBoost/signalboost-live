-- Universal Self-Healing provider circuit state.
-- A provider/capability circuit blocks repeat cost-bearing work after deterministic
-- infrastructure, quota, auth, billing or invalid-request failures. It does not
-- widen spend, promotion, credential or runtime authority.
create table if not exists public.self_healing_provider_circuits (
  provider_id text not null,
  capability text not null,
  state text not null check (state in ('open','closed')),
  failure_class text not null,
  reason text not null,
  cost_bearing_retry_allowed boolean not null default false,
  opened_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  closed_at timestamptz,
  evidence_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  recovery_verification jsonb,
  primary key (provider_id, capability)
);

alter table public.self_healing_provider_circuits enable row level security;

revoke all on table public.self_healing_provider_circuits from anon, authenticated;
grant select, insert, update on table public.self_healing_provider_circuits to service_role;

create index if not exists self_healing_provider_circuits_open_idx
  on public.self_healing_provider_circuits (state, provider_id, capability, last_observed_at desc);

comment on table public.self_healing_provider_circuits is
  'Durable provider-agnostic Self-Healing circuit breakers. Open circuits block repeat cost-bearing work until independently verified recovery closes the circuit.';
