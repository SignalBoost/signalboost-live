export const COS_VIDEO_QUEUE_SQL = `
create extension if not exists pgcrypto;

create table if not exists public.cos_video_production_jobs (
  id uuid primary key default gen_random_uuid(),
  title text,
  status text not null default 'queued',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cos_video_production_jobs add column if not exists lifecycle_state text not null default 'incoming';
alter table public.cos_video_production_jobs add column if not exists warning_level text not null default 'green';
alter table public.cos_video_production_jobs add column if not exists pool text not null default 'primary';
`.trim()
