-- Minimal EU application profile schema derived from current US profile column inventory.
-- Intentionally no triggers or seeded customer records until EU Auth flow is integrated.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  slug text,
  display_name text,
  onboarded boolean default false,
  onboarding_completed boolean default false,
  consent_ai_training boolean default false,
  tone_preference text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint profiles_eu_owner_consistency check (user_id is null or user_id = id)
);
create unique index if not exists profiles_eu_slug_idx on public.profiles(slug) where slug is not null;
alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
create policy "EU profile owner may read" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
comment on table public.profiles is
  'EU region profile foundation, admin-written and user-readable. EU signup remains disabled.';
