-- EU tenant assignments belong only in the EU project. Server-only access.
create table if not exists public.eu_tenant_assignments (
 tenant_id text primary key,
 country_code text not null check (country_code ~ '^[A-Z]{2}$'),
 residency_profile text not null default 'EU_EEA' check (residency_profile = 'EU_EEA'),
 region text not null default 'eu-central-1' check (region = 'eu-central-1'),
 created_at timestamptz not null default now()
);
alter table public.eu_tenant_assignments enable row level security;
revoke all on public.eu_tenant_assignments from public, anon, authenticated;
grant select, insert on public.eu_tenant_assignments to service_role;
-- Assignments are immutable; do not grant UPDATE or DELETE, including to service_role.
comment on table public.eu_tenant_assignments is
 'EU-only immutable enrollment region record. Not evidence of complete regional hosting.';
