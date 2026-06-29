-- saas/supabase/migrations/20260629_integration_connections.sql
-- Per-tenant credentials for the sales + marketing integration framework. One row per
-- (org, provider). Service-role backend reads/writes; RLS denies everyone else.
create extension if not exists pgcrypto;

create table if not exists public.integration_connections (
  id            uuid primary key default gen_random_uuid(),
  org_id        text not null,
  provider_id   text not null,
  category      text,
  auth_kind     text,
  access_token  text,
  refresh_token text,
  api_key       text,
  account_ref   text,
  metadata      jsonb not null default '{}'::jsonb,
  expires_at    timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (org_id, provider_id)
);

create index if not exists integration_connections_org_idx on public.integration_connections(org_id);
alter table public.integration_connections enable row level security;
