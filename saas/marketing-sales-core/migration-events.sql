-- saas/marketing-sales-core/migration-events.sql
-- Event capture for the optimization loop. Append-only; one row per real public
-- exposure of a published campaign (view/click). Aggregated into KPIs and used by
-- the director to learn which themes/languages perform. org_id on every row.
create extension if not exists pgcrypto;

create table if not exists public.ms_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  campaign_id uuid not null references public.ms_campaigns(id) on delete cascade,
  kind        text not null default 'view',
  at          timestamptz not null default now()
);
create index if not exists ms_events_campaign_idx on public.ms_events(campaign_id);
create index if not exists ms_events_org_kind_idx on public.ms_events(org_id, kind, at desc);

alter table public.ms_events enable row level security;
