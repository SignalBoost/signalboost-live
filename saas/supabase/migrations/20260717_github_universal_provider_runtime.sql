create table if not exists public.organization_provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  provider_id text not null,
  credential_ref text not null,
  status text not null default 'unknown',
  configuration_version integer not null default 1,
  disabled boolean not null default false,
  revoked boolean not null default false,
  last_validated_at timestamptz,
  validation_failure_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider_id)
);
create table if not exists public.github_webhook_deliveries (
  delivery_id text primary key,
  organization_id text not null,
  event_type text not null,
  payload_hash text not null,
  status text not null,
  work_item_id text,
  received_at timestamptz not null default now(),
  safe_metadata jsonb not null default '{}'::jsonb
);
create table if not exists public.github_normalized_observations (
  observation_id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  provider_id text not null default 'github',
  resource_type text not null,
  resource_id text not null,
  observation_type text not null,
  severity text not null,
  observed_state text not null,
  expected_state text,
  verification_status text not null,
  correlation_id text not null,
  trigger_source text not null,
  evidence_references jsonb not null default '[]'::jsonb,
  safe_metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  unique (organization_id, provider_id, resource_type, resource_id, observation_type, correlation_id)
);
create table if not exists public.github_schedule_state (
  organization_id text not null,
  provider_id text not null default 'github',
  resource_id text not null,
  capability_id text not null,
  window_start timestamptz not null,
  work_item_id text not null,
  retry_count integer not null default 0,
  next_attempt_at timestamptz,
  rate_limit_remaining integer,
  safe_metadata jsonb not null default '{}'::jsonb,
  primary key (organization_id, provider_id, resource_id, capability_id, window_start)
);
create index if not exists github_observations_org_type_idx on public.github_normalized_observations (organization_id, observation_type, observed_at desc);
create index if not exists github_webhook_deliveries_org_event_idx on public.github_webhook_deliveries (organization_id, event_type, received_at desc);
create index if not exists organization_provider_connections_org_status_idx on public.organization_provider_connections (organization_id, provider_id, status);
