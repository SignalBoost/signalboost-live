-- Durable metadata-only audit for governed outbound MCP execution.
-- Tool arguments, tool results, credentials, tokens and remote response bodies are intentionally excluded.
create table if not exists public.provider_hub_mcp_audit (
  event_id text primary key,
  occurred_at timestamptz not null,
  tenant_id text not null,
  environment_id text not null,
  portable_id text not null,
  capability_id text not null,
  provider_id text not null,
  connection_id text not null,
  risk text not null check (risk in ('read','write','consequential')),
  requires_approval boolean not null,
  approval_id text null,
  ok boolean not null,
  duration_ms integer not null check (duration_ms >= 0),
  mode text null,
  error_code text null,
  trace_id text null,
  audit_version text not null,
  created_at timestamptz not null default now()
);

create index if not exists provider_hub_mcp_audit_occurred_at_idx
  on public.provider_hub_mcp_audit (occurred_at desc);
create index if not exists provider_hub_mcp_audit_scope_idx
  on public.provider_hub_mcp_audit (tenant_id, environment_id, portable_id, occurred_at desc);
create index if not exists provider_hub_mcp_audit_capability_idx
  on public.provider_hub_mcp_audit (capability_id, occurred_at desc);

alter table public.provider_hub_mcp_audit enable row level security;
revoke all on table public.provider_hub_mcp_audit from anon, authenticated;
