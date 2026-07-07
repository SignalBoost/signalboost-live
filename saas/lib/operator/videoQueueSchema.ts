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
`.trim()
