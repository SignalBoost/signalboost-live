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

create index if not exists cos_video_production_jobs_status_idx
  on public.cos_video_production_jobs (status);

create index if not exists cos_video_production_jobs_created_at_idx
  on public.cos_video_production_jobs (created_at desc);

alter table public.cos_video_production_jobs enable row level security;

drop policy if exists cos_video_production_jobs_service_role_all on public.cos_video_production_jobs;
create policy cos_video_production_jobs_service_role_all
  on public.cos_video_production_jobs
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
