create table if not exists public.vercel_deployment_health_runs (
  run_id text primary key,
  project_id text not null,
  provider_connection_id text not null,
  environment text not null check (environment in ('sandbox','preview','production')),
  status text not null check (status in ('healthy','incident_detected','read_failed','verification_failed')),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  incident jsonb,
  plan jsonb,
  completed_step_ids text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  verification jsonb not null,
  schema_version text not null default 'vercel-deployment-health-intelligence-v1',
  created_at timestamptz not null default now()
);
create index if not exists vercel_deployment_health_runs_completed_idx on public.vercel_deployment_health_runs (completed_at desc);
create index if not exists vercel_deployment_health_runs_status_idx on public.vercel_deployment_health_runs (status, environment, completed_at desc);
alter table public.vercel_deployment_health_runs enable row level security;
