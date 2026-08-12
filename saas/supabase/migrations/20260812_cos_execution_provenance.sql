create table if not exists public.cos_execution_provenance (
  storage_key text primary key,
  user_id uuid null,
  session_id text null,
  prompt text not null,
  reply text null,
  response_source text not null,
  execution_provenance jsonb not null default '{}'::jsonb,
  live_telemetry jsonb null,
  created_at timestamptz not null default now()
);
create index if not exists cos_execution_provenance_created_at_idx on public.cos_execution_provenance(created_at desc);
alter table public.cos_execution_provenance enable row level security;
revoke all on public.cos_execution_provenance from anon, authenticated;
