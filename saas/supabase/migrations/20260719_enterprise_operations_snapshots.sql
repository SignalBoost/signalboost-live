begin;

create table if not exists public.enterprise_operations_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  generated_at timestamptz not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint enterprise_operations_snapshots_org_not_blank check (length(btrim(organization_id)) > 0),
  constraint enterprise_operations_snapshots_snapshot_object check (jsonb_typeof(snapshot) = 'object'),
  constraint enterprise_operations_snapshots_org_match check (snapshot ->> 'organizationId' = organization_id),
  constraint enterprise_operations_snapshots_generated_match check ((snapshot ->> 'generatedAt')::timestamptz = generated_at)
);

create unique index if not exists enterprise_operations_snapshots_org_generated_uidx
  on public.enterprise_operations_snapshots (organization_id, generated_at desc);

create index if not exists enterprise_operations_snapshots_latest_idx
  on public.enterprise_operations_snapshots (organization_id, generated_at desc, created_at desc);

alter table public.enterprise_operations_snapshots enable row level security;

revoke all on table public.enterprise_operations_snapshots from anon, authenticated;
grant select, insert on table public.enterprise_operations_snapshots to service_role;

comment on table public.enterprise_operations_snapshots is
  'Read-only dashboard snapshots produced by the governed Operations Intelligence API. Browser roles cannot read or mutate this table directly.';

commit;
