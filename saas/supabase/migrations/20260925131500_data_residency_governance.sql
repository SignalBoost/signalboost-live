-- Data residency governance.
-- Additive and fail-closed: no browser/client policy is created. Service-role/admin code owns
-- policy reads/writes. Runtime authorization lives in code; transfer-basis text is evidence only.

create table if not exists public.tenant_data_residency_policies (
  tenant_id text primary key,
  residency_profile text not null
    check (residency_profile in ('GLOBAL','US_ONLY','EU_EEA','BR_ONLY')),
  allowed_processing_zones text[] not null,
  allowed_storage_zones text[] not null,
  default_classification text not null default 'CONFIDENTIAL'
    check (default_classification in ('PUBLIC','INTERNAL','CONFIDENTIAL','RESTRICTED')),
  cross_border_transfer_basis text,
  policy_version integer not null default 1 check (policy_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(allowed_processing_zones) > 0),
  check (cardinality(allowed_storage_zones) > 0),
  check (allowed_processing_zones <@ array['US','EU_EEA','BR','GLOBAL']::text[]),
  check (allowed_storage_zones <@ array['US','EU_EEA','BR','GLOBAL']::text[])
);

alter table public.tenant_data_residency_policies enable row level security;
revoke all on table public.tenant_data_residency_policies from anon, authenticated;
grant select, insert, update, delete on table public.tenant_data_residency_policies to service_role;

comment on table public.tenant_data_residency_policies is
  'Server-only tenant data residency policy. Region allowlists are runtime authority; transfer-basis text is audit evidence and never expands authority.';

insert into public.tenant_data_residency_policies (
  tenant_id,
  residency_profile,
  allowed_processing_zones,
  allowed_storage_zones,
  default_classification,
  cross_border_transfer_basis,
  policy_version
) values (
  'owner',
  'GLOBAL',
  array['US','EU_EEA','BR','GLOBAL']::text[],
  array['US','EU_EEA','BR','GLOBAL']::text[],
  'CONFIDENTIAL',
  null,
  1
)
on conflict (tenant_id) do nothing;
