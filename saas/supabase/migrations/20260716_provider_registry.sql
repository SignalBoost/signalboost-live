-- Dynamic provider/action registry for zero-code, configuration-driven integrations.
-- Backend service-role runners read these rows; direct client access is denied by RLS.
create extension if not exists pgcrypto;

create table if not exists public.provider_registry (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  action_id text not null,
  display_name text,
  description text,
  channel_type text not null default 'software_api' check (channel_type in ('software_api', 'local_hardware', 'webhook', 'internal')),
  is_active boolean not null default true,
  method text not null default 'POST' check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  endpoint_template text not null,
  header_template jsonb not null default '{"Content-Type":"application/json"}'::jsonb,
  payload_template jsonb not null default '{}'::jsonb,
  config_schema jsonb not null default '{}'::jsonb,
  output_paths jsonb not null default '{}'::jsonb,
  timeout_ms integer not null default 30000 check (timeout_ms between 1 and 300000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, action_id)
);

create index if not exists provider_registry_provider_idx on public.provider_registry(provider_id);
create index if not exists provider_registry_active_idx on public.provider_registry(is_active);

alter table public.provider_registry enable row level security;

comment on table public.provider_registry is 'Configuration-driven provider action registry consumed by the universal backend runner.';
comment on column public.provider_registry.endpoint_template is 'URL template hydrated from runtime variables, for example https://api.example.com/v1/{{resource_id}}.';
comment on column public.provider_registry.header_template is 'JSON object of request header templates. Store secret values by reference and hydrate only on the backend.';
comment on column public.provider_registry.payload_template is 'JSON request body template hydrated from runtime variables.';
comment on column public.provider_registry.config_schema is 'JSON schema describing required runtime variables/configuration for UI and validation layers.';
comment on column public.provider_registry.output_paths is 'Map of output names to JSON paths in the provider response, for example {"videoUrl":"$.data.url"}.';
