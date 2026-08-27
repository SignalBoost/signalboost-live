-- Read-only Google Workspace OAuth connections for Google Sheets.
-- Token material is AES-256-GCM ciphertext produced server-side with VAULT_MASTER_KEY.
-- RLS is enabled with no browser policies; only trusted service-role code may access rows.

create table if not exists public.google_workspace_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google_workspace',
  token_ciphertext text not null,
  token_iv text not null,
  token_tag text not null,
  expires_at timestamptz,
  scopes text[] not null default '{}'::text[],
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_error text,
  constraint google_workspace_connections_provider_check check (provider = 'google_workspace'),
  constraint google_workspace_connections_user_provider_unique unique (user_id, provider)
);

create index if not exists google_workspace_connections_user_idx
  on public.google_workspace_connections(user_id);

alter table public.google_workspace_connections enable row level security;

revoke all on public.google_workspace_connections from anon, authenticated;

comment on table public.google_workspace_connections is
  'Server-only encrypted OAuth connection state for read-only Google Workspace integrations.';
