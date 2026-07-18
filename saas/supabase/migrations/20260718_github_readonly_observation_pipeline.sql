-- Mission 001: durable GitHub read-only observation pipeline.
-- Stores only normalized, allowlisted evidence and audit metadata. Never store tokens,
-- authorization headers, cookies, raw webhook bodies, or arbitrary provider responses.

create table if not exists public.github_provider_evidence (
  evidence_id text primary key,
  work_item_id text not null,
  provider text not null default 'github' check (provider = 'github'),
  organization_id text not null,
  resource_type text not null,
  resource_id text not null,
  observation_type text not null,
  severity text not null,
  verification_status text not null,
  summary text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  correlation_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists github_provider_evidence_work_item_idx on public.github_provider_evidence (work_item_id, observed_at desc);
create index if not exists github_provider_evidence_org_idx on public.github_provider_evidence (organization_id, observed_at desc);

create table if not exists public.github_provider_audit_events (
  event_id text primary key,
  work_item_id text not null,
  event_type text not null,
  safe_metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists github_provider_audit_work_item_idx on public.github_provider_audit_events (work_item_id, occurred_at asc);

create table if not exists public.github_webhook_deliveries (
  delivery_id text primary key,
  event_type text not null,
  organization_id text not null,
  repository_full_name text not null,
  payload_digest text not null,
  status text not null check (status in ('accepted_not_processed_yet','queued','processing','completed','failed','deferred')),
  work_item_id text,
  reason_code text,
  received_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists github_webhook_deliveries_queue_idx on public.github_webhook_deliveries (status, received_at asc);

alter table public.github_provider_evidence enable row level security;
alter table public.github_provider_audit_events enable row level security;
alter table public.github_webhook_deliveries enable row level security;

-- Service-role server routes own these internal Mission 001 tables. No public policies.
comment on table public.github_provider_evidence is 'Normalized read-only GitHub observations; no credentials or raw provider payloads.';
comment on table public.github_provider_audit_events is 'Mission 001 GitHub observation lifecycle audit events.';
comment on table public.github_webhook_deliveries is 'Signed GitHub delivery deduplication and queue-age ledger; raw bodies are not stored.';
