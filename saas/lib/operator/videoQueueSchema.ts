export const COS_VIDEO_QUEUE_SQL = `
create extension if not exists pgcrypto;

create table if not exists public.cos_video_production_jobs (
  id uuid primary key default gen_random_uuid(),
  title text,
  status text not null default 'queued',
  production_tier text default 'prototype',
  platforms jsonb not null default '[]'::jsonb,
  hook text,
  audience text,
  render_spec jsonb not null default '{}'::jsonb,
  search_package jsonb not null default '{}'::jsonb,
  approval_state jsonb not null default '{}'::jsonb,
  output_url text,
  thumbnail_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cos_video_production_jobs add column if not exists lifecycle_state text not null default 'incoming';
alter table public.cos_video_production_jobs add column if not exists warning_level text not null default 'green';
alter table public.cos_video_production_jobs add column if not exists pool text not null default 'primary';
alter table public.cos_video_production_jobs add column if not exists fallback_pool text not null default 'secondary';
alter table public.cos_video_production_jobs add column if not exists attempt_count integer not null default 0;
alter table public.cos_video_production_jobs add column if not exists max_attempts integer not null default 5;
alter table public.cos_video_production_jobs add column if not exists reroute_count integer not null default 0;
alter table public.cos_video_production_jobs add column if not exists auto_apply boolean not null default true;
alter table public.cos_video_production_jobs add column if not exists priority integer not null default 100;
alter table public.cos_video_production_jobs add column if not exists machine_id text;
alter table public.cos_video_production_jobs add column if not exists provider_ref text;
alter table public.cos_video_production_jobs add column if not exists vercel_environment text;
alter table public.cos_video_production_jobs add column if not exists last_heartbeat_at timestamptz;
alter table public.cos_video_production_jobs add column if not exists reroute_reason text;
alter table public.cos_video_production_jobs add column if not exists queue_drop_reason text;
alter table public.cos_video_production_jobs add column if not exists cockpit_ticket_id uuid;
alter table public.cos_video_production_jobs add column if not exists escalated_at timestamptz;
alter table public.cos_video_production_jobs add column if not exists completed_at timestamptz;
alter table public.cos_video_production_jobs add column if not exists telemetry jsonb not null default '{}'::jsonb;
alter table public.cos_video_production_jobs add column if not exists watchdog_signal jsonb not null default '{}'::jsonb;
alter table public.cos_video_production_jobs add column if not exists audit_trail jsonb not null default '[]'::jsonb;

create index if not exists cos_video_production_jobs_status_idx on public.cos_video_production_jobs (status);
create index if not exists cos_video_production_jobs_created_at_idx on public.cos_video_production_jobs (created_at desc);
create index if not exists cos_video_production_jobs_lifecycle_state_idx on public.cos_video_production_jobs (lifecycle_state);
create index if not exists cos_video_production_jobs_warning_level_idx on public.cos_video_production_jobs (warning_level);
create index if not exists cos_video_production_jobs_pool_status_idx on public.cos_video_production_jobs (pool, status);
create index if not exists cos_video_production_jobs_heartbeat_idx on public.cos_video_production_jobs (last_heartbeat_at);
create index if not exists cos_video_production_jobs_escalated_at_idx on public.cos_video_production_jobs (escalated_at desc);

create table if not exists public.cos_video_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.cos_video_production_jobs(id),
  event_type text not null,
  severity text not null default 'info',
  pool text,
  machine_id text,
  provider_ref text,
  vercel_environment text,
  actor_type text not null default 'system',
  actor_id text,
  auto_apply boolean,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cos_video_lifecycle_events_job_idx on public.cos_video_lifecycle_events (job_id, created_at desc);
create index if not exists cos_video_lifecycle_events_type_idx on public.cos_video_lifecycle_events (event_type, created_at desc);
create index if not exists cos_video_lifecycle_events_severity_idx on public.cos_video_lifecycle_events (severity, created_at desc);

create table if not exists public.cos_video_escalation_tickets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.cos_video_production_jobs(id),
  source text not null default 'watchdog',
  severity text not null default 'orange',
  status text not null default 'open',
  title text not null,
  detail text,
  pool text,
  machine_id text,
  provider_ref text,
  vercel_environment text,
  auto_apply boolean,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists cos_video_escalation_tickets_job_idx on public.cos_video_escalation_tickets (job_id, created_at desc);
create index if not exists cos_video_escalation_tickets_status_idx on public.cos_video_escalation_tickets (status, severity, created_at desc);

create table if not exists public.cos_decisions (
  id uuid primary key default gen_random_uuid(),
  decision_id text not null unique,
  user_id uuid,
  objective text,
  channel text,
  state text,
  required_source text,
  must_use_tool boolean not null default false,
  proposes_action boolean not null default false,
  required_approval boolean not null default false,
  approval_reasons jsonb not null default '[]'::jsonb,
  confidence numeric,
  output jsonb not null default '{}'::jsonb,
  outcome jsonb,
  status text not null default 'logged',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  executed_at timestamptz
);

create index if not exists cos_decisions_created_at_idx on public.cos_decisions (created_at desc);
create index if not exists cos_decisions_status_idx on public.cos_decisions (status, created_at desc);
create index if not exists cos_decisions_channel_idx on public.cos_decisions (channel, created_at desc);
create index if not exists cos_decisions_required_approval_idx on public.cos_decisions (required_approval, created_at desc);
`.trim()
