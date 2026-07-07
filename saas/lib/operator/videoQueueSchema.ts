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
`.trim()
