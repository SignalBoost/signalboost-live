-- COS video production pipeline jobs
-- Creates a persistent queue for real video production work.

create extension if not exists pgcrypto;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function is_signalboost_admin()
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'role') = 'service_role', false)
    or coalesce((auth.jwt() -> 'app_metadata' ->> 'role') in ('owner','admin'), false)
    or coalesce((auth.jwt() -> 'user_metadata' ->> 'role') in ('owner','admin'), false);
$$;

create table if not exists public.cos_video_production_jobs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'planned' check (status in ('planned','queued','rendering','rendered','approved','rejected','failed')),
  production_tier text not null default 'enterprise' check (production_tier in ('prototype','professional','enterprise')),
  platforms text[] not null default array[]::text[],
  hook text not null default '',
  audience text not null default '',
  render_spec jsonb not null default '{}'::jsonb,
  search_package jsonb not null default '{}'::jsonb,
  approval_state jsonb not null default '{}'::jsonb,
  output_url text,
  thumbnail_url text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_video_production_jobs_status_idx on public.cos_video_production_jobs(status, created_at desc);
create index if not exists cos_video_production_jobs_tier_idx on public.cos_video_production_jobs(production_tier, created_at desc);

drop trigger if exists touch_cos_video_production_jobs_updated_at on public.cos_video_production_jobs;
create trigger touch_cos_video_production_jobs_updated_at
before update on public.cos_video_production_jobs
for each row execute function touch_updated_at();

alter table public.cos_video_production_jobs enable row level security;

drop policy if exists cos_video_production_jobs_admin_all on public.cos_video_production_jobs;
create policy cos_video_production_jobs_admin_all
on public.cos_video_production_jobs
for all
using (is_signalboost_admin())
with check (is_signalboost_admin());
