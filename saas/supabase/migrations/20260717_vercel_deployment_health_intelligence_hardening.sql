alter table public.vercel_deployment_health_runs
  add column if not exists approved_step_ids text[] not null default '{}',
  add column if not exists selected_channel text not null default 'api' check (selected_channel in ('api','browser','manual','none')),
  add column if not exists api_failure_category text,
  add column if not exists comparison_status text not null default 'unavailable' check (comparison_status in ('completed','unavailable','metadata-ready','comparison-pending')),
  add column if not exists governance jsonb,
  add column if not exists bpal_selections jsonb not null default '[]'::jsonb,
  add column if not exists audit_events jsonb not null default '[]'::jsonb;

alter table public.vercel_deployment_health_runs drop constraint if exists vercel_deployment_health_runs_status_check;
alter table public.vercel_deployment_health_runs
  add constraint vercel_deployment_health_runs_status_check
  check (status in ('healthy','incident_detected','read_failed','verification_failed','rejected'));

create index if not exists vercel_deployment_health_runs_work_item_idx
  on public.vercel_deployment_health_runs ((governance->>'workItemId'));
create index if not exists vercel_deployment_health_runs_channel_idx
  on public.vercel_deployment_health_runs (selected_channel, comparison_status, completed_at desc);

alter table public.vercel_deployment_health_runs enable row level security;
