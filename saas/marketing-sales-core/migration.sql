-- saas/marketing-sales-core/migration.sql
-- Portable schema for the Marketing & Sales department. Idempotent and
-- org-scoped: every row carries org_id so an enterprise's brands stay isolated.
-- An adopting host runs this against any Postgres/Supabase project.

create extension if not exists pgcrypto;

-- Campaigns ------------------------------------------------------------------
create table if not exists public.ms_campaigns (
  id          uuid primary key default gen_random_uuid(),
  org_id      text not null,
  status      text not null default 'intake',
  objective   text not null,
  channel     text,
  created_by  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists ms_campaigns_org_idx    on public.ms_campaigns(org_id);
create index if not exists ms_campaigns_status_idx on public.ms_campaigns(org_id, status);

-- Drafts (one per language) --------------------------------------------------
create table if not exists public.ms_drafts (
  id           uuid primary key default gen_random_uuid(),
  org_id       text not null,
  campaign_id  uuid not null references public.ms_campaigns(id) on delete cascade,
  lang         text not null,
  title        text not null,
  body         text not null,
  asset_url    text,
  asset_status text not null default 'none',
  created_at   timestamptz not null default now()
);
create index if not exists ms_drafts_campaign_idx on public.ms_drafts(campaign_id);
create index if not exists ms_drafts_org_idx      on public.ms_drafts(org_id);

-- Publish results (a campaign is 'published' only with a real live_url) -------
create table if not exists public.ms_publish_results (
  id           uuid primary key default gen_random_uuid(),
  org_id       text not null,
  campaign_id  uuid not null references public.ms_campaigns(id) on delete cascade,
  connector_id text not null,
  live_url     text,
  external_id  text,
  ok           boolean not null default false,
  error        text,
  at           timestamptz not null default now()
);
create index if not exists ms_publish_campaign_idx on public.ms_publish_results(campaign_id);

-- Metrics --------------------------------------------------------------------
create table if not exists public.ms_metrics (
  id           uuid primary key default gen_random_uuid(),
  org_id       text not null,
  campaign_id  uuid not null references public.ms_campaigns(id) on delete cascade,
  ctr          double precision,
  roi          double precision,
  retention    double precision,
  captured_at  timestamptz not null default now()
);
create index if not exists ms_metrics_campaign_idx on public.ms_metrics(campaign_id);

-- Immutable audit (append-only; no update/delete granted) --------------------
create table if not exists public.ms_audit (
  id        uuid primary key default gen_random_uuid(),
  actor_id  text not null,
  org_id    text not null,
  action    text not null,
  outcome   text,
  detail    jsonb,
  at        timestamptz not null default now()
);
create index if not exists ms_audit_org_idx on public.ms_audit(org_id, at desc);

-- RLS: admin-only by default; the host's service role bypasses RLS for the
-- department engine. Adopters tighten per their own policy model.
alter table public.ms_campaigns       enable row level security;
alter table public.ms_drafts          enable row level security;
alter table public.ms_publish_results enable row level security;
alter table public.ms_metrics         enable row level security;
alter table public.ms_audit           enable row level security;
