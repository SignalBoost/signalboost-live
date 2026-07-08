import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/outreach/security'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SQL_STEPS: Array<{ label: string; query: string }> = [
  { label: 'pgcrypto', query: 'create extension if not exists pgcrypto' },
  {
    label: 'admin_function',
    query: `create or replace function public.is_signalboost_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() ->> 'email') = any(
      string_to_array(coalesce(current_setting('app.admin_emails', true), ''), ',')
    ),
    false
  )
  or exists (
    select 1
    from public.team_members tm
    where (tm.member_id = auth.uid() or tm.owner_id = auth.uid())
      and (tm.status = 'active' or tm.owner_id = auth.uid())
      and (tm.role in ('owner','admin') or tm.owner_id = auth.uid())
  );
$$`,
  },
  {
    label: 'tokens_table',
    query: `create table if not exists public.outreach_social_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  access_token text,
  refresh_token text,
  account_ref text,
  account_name text,
  scopes jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)`,
  },
  { label: 'tokens_user', query: 'alter table public.outreach_social_tokens add column if not exists user_id uuid references auth.users(id) on delete cascade' },
  { label: 'tokens_platform', query: 'alter table public.outreach_social_tokens add column if not exists platform text' },
  { label: 'tokens_access', query: 'alter table public.outreach_social_tokens add column if not exists access_token text' },
  { label: 'tokens_refresh', query: 'alter table public.outreach_social_tokens add column if not exists refresh_token text' },
  { label: 'tokens_account_ref', query: 'alter table public.outreach_social_tokens add column if not exists account_ref text' },
  { label: 'tokens_account_name', query: 'alter table public.outreach_social_tokens add column if not exists account_name text' },
  { label: 'tokens_scopes', query: "alter table public.outreach_social_tokens add column if not exists scopes jsonb not null default '[]'::jsonb" },
  { label: 'tokens_expires', query: 'alter table public.outreach_social_tokens add column if not exists expires_at timestamptz' },
  { label: 'tokens_created', query: 'alter table public.outreach_social_tokens add column if not exists created_at timestamptz not null default now()' },
  { label: 'tokens_updated', query: 'alter table public.outreach_social_tokens add column if not exists updated_at timestamptz not null default now()' },
  { label: 'tokens_unique', query: 'create unique index if not exists outreach_social_tokens_user_platform_unique on public.outreach_social_tokens(user_id, platform)' },
  { label: 'tokens_lookup', query: 'create index if not exists outreach_social_tokens_user_platform_idx on public.outreach_social_tokens(user_id, platform)' },
  {
    label: 'campaigns_table',
    query: `create table if not exists public.outreach_social_campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  objective text not null,
  target_url text,
  target_audience text,
  language text not null default 'en',
  platforms jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null
)`,
  },
  { label: 'campaigns_status_idx', query: 'create index if not exists outreach_social_campaigns_status_created_idx on public.outreach_social_campaigns(status, created_at desc)' },
  { label: 'campaigns_owner_idx', query: 'create index if not exists outreach_social_campaigns_owner_idx on public.outreach_social_campaigns(owner_id, created_at desc)' },
  {
    label: 'posts_table',
    query: `create table if not exists public.outreach_social_campaign_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.outreach_social_campaigns(id) on delete cascade,
  platform text not null,
  account_ref text,
  account_name text,
  post_text text not null,
  title text,
  image_url text,
  video_url text,
  status text not null default 'pending_approval',
  provider_post_id text,
  live_url text,
  metrics jsonb not null default '{}'::jsonb,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz
)`,
  },
  { label: 'posts_campaign_idx', query: 'create index if not exists outreach_social_campaign_posts_campaign_idx on public.outreach_social_campaign_posts(campaign_id, created_at desc)' },
  { label: 'posts_status_idx', query: 'create index if not exists outreach_social_campaign_posts_status_idx on public.outreach_social_campaign_posts(status, created_at desc)' },
  { label: 'posts_platform_idx', query: 'create index if not exists outreach_social_campaign_posts_platform_idx on public.outreach_social_campaign_posts(platform, created_at desc)' },
  { label: 'legacy_social_send_log_nullable', query: 'alter table public.outreach_sends alter column outreach_id drop not null' },
  { label: 'tokens_rls', query: 'alter table public.outreach_social_tokens enable row level security' },
  { label: 'campaigns_rls', query: 'alter table public.outreach_social_campaigns enable row level security' },
  { label: 'posts_rls', query: 'alter table public.outreach_social_campaign_posts enable row level security' },
  {
    label: 'policies',
    query: `do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_social_tokens' and policyname = 'Admins manage social tokens') then
    create policy "Admins manage social tokens" on public.outreach_social_tokens for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_social_campaigns' and policyname = 'Admins manage social campaigns') then
    create policy "Admins manage social campaigns" on public.outreach_social_campaigns for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_social_campaign_posts' and policyname = 'Admins manage social campaign posts') then
    create policy "Admins manage social campaign posts" on public.outreach_social_campaign_posts for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
end $$`,
  },
  { label: 'reload_schema', query: "select pg_notify('pgrst', 'reload schema')" },
]

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)) }

async function runSql(admin: any, step: { label: string; query: string }) {
  const res = await admin.rpc('hub_exec_sql', { query: step.query })
  if (res.error) throw new Error(`${step.label}: ${res.error.message}`)
  return { label: step.label, result: res.data }
}

async function checkTables(admin: any) {
  const checks = await Promise.all([
    admin.from('outreach_social_tokens').select('id').limit(1),
    admin.from('outreach_social_campaigns').select('id').limit(1),
    admin.from('outreach_social_campaign_posts').select('id').limit(1),
  ])
  return checks.map((res, index) => ({ index, error: res.error?.message || null })).filter(item => item.error)
}

export async function GET() {
  const ctx = await requireAdmin()
  if (ctx instanceof NextResponse) return ctx

  const setupResults: any[] = []
  try {
    for (const step of SQL_STEPS) setupResults.push(await runSql(ctx.admin, step))
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || 'Social outreach schema setup failed.', setupResults }, { status: 500 })
  }

  let failed: Array<{ index: number; error: string | null }> = []
  for (let attempt = 1; attempt <= 6; attempt++) {
    failed = await checkTables(ctx.admin)
    if (!failed.length) break
    await runSql(ctx.admin, { label: `reload_schema_${attempt}`, query: "select pg_notify('pgrst', 'reload schema')" })
    await sleep(750)
  }

  if (failed.length) return NextResponse.json({ ok: false, error: 'Social outreach schema setup completed, but PostgREST schema cache has not refreshed yet. Retry this endpoint in a few seconds.', failed, setupResults }, { status: 202 })

  return NextResponse.json({ ok: true, message: 'Social outreach backend schema is ready.', setupResults })
}

export async function POST() { return GET() }
