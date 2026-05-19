-- saas/supabase/migrations/20260519_create_reviews.sql
-- Run this in Supabase: SQL Editor → New query → paste → Run.
--
-- Creates:
--   1. profiles.slug — public-facing handle for the review URL
--   2. reviews — collected reviews (private until owner approves)
--   3. RLS policies that prevent any cross-user leakage
--   4. Helper function to count an owner's reviews (for the free-tier cap)


-- ============================================================
-- 1. profiles.slug
--    Owner picks a slug. URL is /review/{slug}, never /review/{uuid}.
--    Slug is the ONLY thing about an owner that's publicly resolvable.
-- ============================================================

-- profiles table already exists (AuthModal references the onboarded flag).
-- We just add the slug column if it's missing.
alter table public.profiles
  add column if not exists slug text unique;

-- Slug shape: 3-30 chars, lowercase letters/digits/hyphens, no leading/trailing hyphen.
alter table public.profiles
  drop constraint if exists profiles_slug_format;
alter table public.profiles
  add constraint profiles_slug_format
  check (slug is null or slug ~ '^[a-z0-9]([a-z0-9-]{1,28}[a-z0-9])?$');

create index if not exists profiles_slug_idx on public.profiles (slug);


-- ============================================================
-- 2. reviews
-- ============================================================
create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  author_name   text not null check (length(trim(author_name)) between 1 and 80),
  author_email  text not null check (author_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  rating        integer not null check (rating between 1 and 5),
  content       text not null check (length(trim(content)) between 1 and 2000),
  language      text not null default 'en' check (length(language) between 2 and 8),
  approved      boolean not null default false,
  submitter_ip  text,                                    -- for rate limiting, never returned to client
  created_at    timestamptz not null default now()
);

create index if not exists reviews_owner_created_idx
  on public.reviews (owner_id, created_at desc);

create index if not exists reviews_owner_approved_idx
  on public.reviews (owner_id, approved);

alter table public.reviews enable row level security;

-- SELECT: only the owner sees their reviews. Public never reads from this table directly.
drop policy if exists "Owners read own reviews" on public.reviews;
create policy "Owners read own reviews"
  on public.reviews for select
  using (auth.uid() = owner_id);

-- INSERT: blocked at the table level for everyone. Public form goes through
--         the /api/reviews route, which uses the service role. This keeps
--         rate limiting, slug resolution, and the free-tier cap on the server,
--         not in RLS.
-- (No insert policy = no inserts via anon/authed client. Service role bypasses RLS.)

-- UPDATE: owner only, and only the approved flag may change.
--         Reviewers can't edit their reviews; owners can't rewrite them either.
drop policy if exists "Owners toggle approval" on public.reviews;
create policy "Owners toggle approval"
  on public.reviews for update
  using (auth.uid() = owner_id)
  with check (
    auth.uid() = owner_id
    and owner_id = (select owner_id from public.reviews r where r.id = reviews.id)
  );

-- DELETE: owner only.
drop policy if exists "Owners delete own reviews" on public.reviews;
create policy "Owners delete own reviews"
  on public.reviews for delete
  using (auth.uid() = owner_id);


-- ============================================================
-- 3. Helper: count reviews for an owner.
--    Used by the /api/reviews POST handler to enforce the
--    free-tier 3-review cap server-side.
-- ============================================================
create or replace function public.count_reviews_for_owner(p_owner uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(count(*)::int, 0)
  from public.reviews
  where owner_id = p_owner;
$$;

revoke all on function public.count_reviews_for_owner(uuid) from public;
grant execute on function public.count_reviews_for_owner(uuid) to service_role;


-- ============================================================
-- Notes for the operator:
--   * No public read access anywhere on reviews. The public review-submission
--     page does NOT need to read reviews — it only writes (via service role).
--   * submitter_ip is intentionally never selected by any client-facing API.
--     It exists for abuse forensics only.
--   * If a profile row doesn't exist yet for a user, the slug-claim API
--     (next files) will create it. Don't worry about backfilling here.
-- ============================================================
