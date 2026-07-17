create table if not exists public.mission001_platform_health_snapshots (
  snapshot_id text primary key,
  captured_at timestamptz not null,
  status text not null check (status in ('healthy','warning','critical','unknown','maintenance')),
  score integer not null check (score >= 0 and score <= 100),
  components jsonb not null default '{}'::jsonb,
  subsystems jsonb not null default '[]'::jsonb,
  alerts jsonb not null default '[]'::jsonb,
  recoveries jsonb not null default '[]'::jsonb,
  trends jsonb not null default '[]'::jsonb,
  verification jsonb not null default '{}'::jsonb,
  schema_version text not null default 'mission001-platform-health-v1',
  created_at timestamptz not null default now()
);
create index if not exists mission001_platform_health_snapshots_captured_idx on public.mission001_platform_health_snapshots (captured_at desc);
create index if not exists mission001_platform_health_snapshots_status_idx on public.mission001_platform_health_snapshots (status, captured_at desc);
alter table public.mission001_platform_health_snapshots enable row level security;
