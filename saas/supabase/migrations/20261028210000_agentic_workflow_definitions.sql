-- Immutable, owner-scoped workflow definitions. Execution remains disabled until a separately reviewed runner exists.
create table if not exists public.agentic_workflow_definitions (
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id text not null check (workflow_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  revision integer not null check (revision >= 1),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) <= 65536),
  created_at timestamptz not null default now(),
  primary key (user_id, workflow_id, revision)
);
create index if not exists agentic_workflow_definitions_latest
  on public.agentic_workflow_definitions (user_id, workflow_id, revision desc);
alter table public.agentic_workflow_definitions enable row level security;
revoke all on public.agentic_workflow_definitions from public, anon, authenticated;
grant select, insert on public.agentic_workflow_definitions to service_role;
-- Server-only access; no authenticated or anonymous client role policy.
