create extension if not exists pgcrypto;

create table if not exists public.outreach_social_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  access_token text,
  refresh_token text,
  account_ref text,
  account_name text,
  scopes jsonb not null default '[]'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, platform)
);

alter table public.outreach_social_tokens add column if not exists account_ref text;
alter table public.outreach_social_tokens add column if not exists account_name text;
alter table public.outreach_social_tokens add column if not exists scopes jsonb not null default '[]'::jsonb;
alter table public.outreach_social_tokens add column if not exists expires_at timestamptz;
alter table public.outreach_social_tokens add column if not exists created_at timestamptz not null default now();
alter table public.outreach_social_tokens add column if not exists updated_at timestamptz not null default now();

create index if not exists outreach_social_tokens_user_platform_idx on public.outreach_social_tokens(user_id, platform);

create table if not exists public.outreach_social_campaigns (
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
);

create index if not exists outreach_social_campaigns_status_created_idx on public.outreach_social_campaigns(status, created_at desc);
create index if not exists outreach_social_campaigns_owner_idx on public.outreach_social_campaigns(owner_id, created_at desc);

create table if not exists public.outreach_social_campaign_posts (
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
);

create index if not exists outreach_social_campaign_posts_campaign_idx on public.outreach_social_campaign_posts(campaign_id, created_at desc);
create index if not exists outreach_social_campaign_posts_status_idx on public.outreach_social_campaign_posts(status, created_at desc);
create index if not exists outreach_social_campaign_posts_platform_idx on public.outreach_social_campaign_posts(platform, created_at desc);

alter table public.outreach_social_tokens enable row level security;
alter table public.outreach_social_campaigns enable row level security;
alter table public.outreach_social_campaign_posts enable row level security;

do $$
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
end $$;
