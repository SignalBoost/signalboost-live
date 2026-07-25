-- saas/supabase/migrations/20260725_agent_operation_activity.sql

create table if not exists public.agent_operation_activity (
  id uuid primary key default gen_random_uuid(),
  workflow_id text not null,
  request_id text not null,
  provider_id text,
  outcome text not null check (outcome in ('success', 'denial', 'failure')),
  event_count integer not null default 0 check (event_count >= 0),
  duration_ms integer not null default 0 check (duration_ms >= 0),
  created_at timestamptz not null default now(),
  unique (workflow_id, request_id)
);

create index if not exists agent_operation_activity_created_at_idx
  on public.agent_operation_activity (created_at desc);

alter table public.agent_operation_activity enable row level security;

comment on table public.agent_operation_activity is
  'Redacted operational ledger for Agent Operations Platform workflow outcomes. No prompts, credentials, code, or user content are stored.';
