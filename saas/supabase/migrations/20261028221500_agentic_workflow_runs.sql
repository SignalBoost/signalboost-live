-- State is append-only by generation; never restart a claimed effect without reconciliation.
create table if not exists public.agentic_workflow_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id text not null,
  definition_revision integer not null,
  generation integer not null default 0 check (generation >= 0),
  state jsonb not null check (jsonb_typeof(state)='object' and octet_length(state::text) <= 65536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(user_id,workflow_id,definition_revision)
    references public.agentic_workflow_definitions(user_id,workflow_id,revision)
);
create index if not exists agentic_workflow_runs_owner_updated_idx
  on public.agentic_workflow_runs(user_id,updated_at desc);
alter table public.agentic_workflow_runs enable row level security;
revoke all on public.agentic_workflow_runs from public, anon, authenticated;
grant select, insert, update on public.agentic_workflow_runs to service_role;
