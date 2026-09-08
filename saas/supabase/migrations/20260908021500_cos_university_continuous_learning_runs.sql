create table if not exists public.cos_university_continuous_runs (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null unique,
  status text not null default 'running' check (status in ('running','completed','error')),
  planned_count integer not null default 0,
  eligible_count integer not null default 0,
  gap_count integer not null default 0,
  documents_acquired integer not null default 0,
  accepted_count integer not null default 0,
  probationary_count integer not null default 0,
  plans_attempted integer not null default 0,
  plan_ids uuid[] not null default '{}',
  source_errors jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cos_university_continuous_runs_created_at
  on public.cos_university_continuous_runs (created_at desc);

alter table public.cos_university_continuous_runs enable row level security;
revoke all on table public.cos_university_continuous_runs from anon, authenticated;
grant all on table public.cos_university_continuous_runs to service_role;
