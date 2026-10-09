-- Minimal EU-only Auth profile foundation; no US data replication.
create table if not exists public.eu_auth_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 tenant_id text not null references public.eu_tenant_assignments(tenant_id),
 created_at timestamptz not null default now()
);
create index if not exists eu_auth_profiles_tenant_idx on public.eu_auth_profiles(tenant_id);
alter table public.eu_auth_profiles enable row level security;
revoke all on public.eu_auth_profiles from public, anon, authenticated;
grant select on public.eu_auth_profiles to authenticated;
grant select, insert, update, delete on public.eu_auth_profiles to service_role;
create policy "EU users can read own residency binding"
 on public.eu_auth_profiles for select to authenticated
 using ((select auth.uid()) = user_id);
comment on table public.eu_auth_profiles is
 'EU Auth-to-tenant binding. No direct client writes or cross-region fallback.';
