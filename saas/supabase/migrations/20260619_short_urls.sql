-- Migration: short_urls
-- Creates the table that backs the URL shortener feature.
-- Each row is one short link owned by a user.

create table if not exists public.short_urls (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  slug        text not null,
  long_url    text not null,
  click_count bigint not null default 0,
  created_at  timestamptz not null default now(),

  constraint short_urls_slug_unique unique (slug),
  constraint short_urls_slug_format check (slug ~ '^[a-z0-9_-]{3,32}$'),
  constraint short_urls_long_url_format check (long_url ~ '^https?://')
);

-- Index for fast slug lookups on the redirect route (hot path).
create index if not exists short_urls_slug_idx on public.short_urls (slug);

-- Index so the dashboard query (filter by user_id, order by created_at) is fast.
create index if not exists short_urls_user_created_idx on public.short_urls (user_id, created_at desc);

-- Row-level security: users can only see and manage their own links.
alter table public.short_urls enable row level security;

create policy "owner_select" on public.short_urls
  for select using (auth.uid() = user_id);

create policy "owner_insert" on public.short_urls
  for insert with check (auth.uid() = user_id);

create policy "owner_update" on public.short_urls
  for update using (auth.uid() = user_id);

create policy "owner_delete" on public.short_urls
  for delete using (auth.uid() = user_id);

-- The redirect route runs with the service-role key and bypasses RLS,
-- so it can increment click_count for any slug without auth context.
-- No extra policy needed for that path.
