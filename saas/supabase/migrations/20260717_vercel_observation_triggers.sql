create table if not exists public.vercel_observation_triggers (
  trigger_id text primary key,
  deduplication_key text not null unique,
  tenant_id text not null,
  provider text not null check (provider = 'vercel'),
  provider_connection_id text not null,
  project_id text not null,
  deployment_id text,
  environment text not null check (environment in ('sandbox','preview','production')),
  trigger_source text not null check (trigger_source in ('scheduled_observation','vercel_webhook','operator_requested','reconciliation')),
  event_type text,
  incident_type text,
  fingerprint text not null,
  event_time timestamptz,
  received_time timestamptz not null,
  deduplication_status text not null check (deduplication_status in ('created','reused','rejected','deferred')),
  work_item_id text,
  terminal_status text,
  reason_code text,
  safe_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vercel_observation_triggers_no_raw_payload check (not (safe_metadata ? 'rawBody') and not (safe_metadata ? 'headers') and not (safe_metadata ? 'signature'))
);
create index if not exists vercel_observation_triggers_active_idx on public.vercel_observation_triggers (provider, tenant_id, provider_connection_id, project_id, environment, deduplication_status, received_time desc);
create index if not exists vercel_observation_triggers_deployment_idx on public.vercel_observation_triggers (project_id, deployment_id, event_type, received_time desc);
alter table public.vercel_observation_triggers enable row level security;
comment on table public.vercel_observation_triggers is 'Durable sanitized trigger/deduplication ledger for read-only Vercel health observations; no raw webhook bodies, headers, signatures, secrets, or provider tokens are stored.';
