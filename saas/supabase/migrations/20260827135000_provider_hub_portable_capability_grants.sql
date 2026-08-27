-- Reuse one provider connection across explicitly authorized SignalBoost portables.
--
-- This table stores authorization metadata only. It never stores provider credentials,
-- OAuth tokens, refresh tokens, API keys, payloads, or spend authority. The SignalBoost
-- host reads/writes it through the service role after an authenticated admin action.

create table if not exists public.provider_hub_portable_capability_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tenant_id text not null,
  environment_id text not null,
  portable_id text not null,
  capability_id text not null,
  enabled boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint provider_hub_capability_grants_identity_key
    unique (user_id, tenant_id, environment_id, portable_id, capability_id),
  constraint provider_hub_capability_grants_tenant_nonempty check (length(trim(tenant_id)) between 1 and 200),
  constraint provider_hub_capability_grants_environment_nonempty check (length(trim(environment_id)) between 1 and 200),
  constraint provider_hub_capability_grants_portable_nonempty check (length(trim(portable_id)) between 1 and 200),
  constraint provider_hub_capability_grants_capability_nonempty check (length(trim(capability_id)) between 1 and 300)
);

create index if not exists provider_hub_capability_grants_lookup_idx
  on public.provider_hub_portable_capability_grants(user_id, tenant_id, environment_id, portable_id)
  where enabled = true;

alter table public.provider_hub_portable_capability_grants enable row level security;

-- Capability grants change what another portable may ask Provider Hub to expose. Keep this
-- mutation behind the authenticated host API rather than allowing browser-role table writes.
revoke all on table public.provider_hub_portable_capability_grants from anon, authenticated;

comment on table public.provider_hub_portable_capability_grants is
  'Exact, deny-by-default authorization for reusing an existing provider capability from another SignalBoost portable. Stores no provider secrets or tokens.';
