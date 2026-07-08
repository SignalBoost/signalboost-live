create extension if not exists pgcrypto;

create table if not exists public.outreach_social_destinations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  account_ref text not null,
  account_name text,
  kind text,
  access_token text,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, platform, account_ref)
);

create index if not exists outreach_social_destinations_user_platform_idx on public.outreach_social_destinations(user_id, platform);
create index if not exists outreach_social_destinations_platform_idx on public.outreach_social_destinations(platform, discovered_at desc);

alter table public.outreach_social_destinations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'outreach_social_destinations' and policyname = 'Admins manage social destinations') then
    create policy "Admins manage social destinations" on public.outreach_social_destinations for all using (public.is_signalboost_admin()) with check (public.is_signalboost_admin());
  end if;
end $$;
