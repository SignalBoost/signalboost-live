-- saas/supabase/migrations/20260705_tenant_organizations.sql
-- Multi-tenant organization registry. Credentials are stored only as references
-- into vault_items and never as plaintext secrets.

create table if not exists public.tenant_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  client_id_vault_key uuid not null references public.vault_items (id) on delete restrict,
  client_secret_vault_key uuid not null references public.vault_items (id) on delete restrict,
  gcp_api_vault_key uuid not null references public.vault_items (id) on delete restrict,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tenant_organizations_slug_idx on public.tenant_organizations (slug);

alter table public.tenant_organizations enable row level security;

drop policy if exists "tenant_orgs_no_anon" on public.tenant_organizations;
create policy "tenant_orgs_no_anon"
  on public.tenant_organizations
  for all
  using (false)
  with check (false);
