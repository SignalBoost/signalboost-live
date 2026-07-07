import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccess } from '@/lib/auth/access'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SQL = `
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
`.trim()

function client() {
  const url = process.env[['NEXT', 'PUBLIC', 'SUPABASE', 'URL'].join('_')]!
  const key = process.env[['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')]!
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET() {
  const access = await getAccess()
  if (!access.isOwner) return NextResponse.json({ ok: false, error: 'Owner only.' }, { status: 403 })

  const sb = client()
  const res = await sb.rpc('hub_exec_sql', { query: SQL })
  if (res.error) {
    return NextResponse.json({
      ok: false,
      error: res.error.message,
      note: 'Could not run setup SQL through hub_exec_sql. Open Console Hub > Supabase > SQL Editor and run the migration file saas/supabase/migrations/20260707_cos_video_production_jobs.sql.',
    }, { status: 500 })
  }

  const check = await sb.from('cos_video_production_jobs').select('id').limit(1)
  if (check.error) {
    return NextResponse.json({ ok: false, error: check.error.message, setupResult: res.data }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'COS video production jobs table is ready.', setupResult: res.data })
}
