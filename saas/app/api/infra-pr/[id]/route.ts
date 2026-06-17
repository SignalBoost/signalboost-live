-- =====================================================================
-- PR-style infrastructure approval queue
-- Run in the SaaS canonical Supabase project: qpblefwtnbivuusxmabv
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- The pending PR queue. A row = one drafted infrastructure change that
-- the AI generated but has NOT executed. It executes only on merge.
-- `payload` is the EXACT body that /api/hub/action accepts, stored
-- verbatim so the merge step can replay it through the live engine.
-- ---------------------------------------------------------------------
create table if not exists public.pending_infrastructure_prs (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  source            text not null default 'assistant',   -- 'assistant' | 'manual'
  title             text not null,
  description       text,
  service           text not null,                        -- vercel | supabase | github | stripe | openai | resend | ...
  action            text not null,                        -- template / action id in the Hub engine
  payload           jsonb not null default '{}'::jsonb,    -- exact body replayed to /api/hub/action
  diff              jsonb,                                 -- optional before/after preview for the reviewer
  risk              text not null default 'medium',        -- low | medium | high
  triggers_redeploy boolean not null default false,        -- merge should fire a production redeploy
  status            text not null default 'open',          -- open | merging | merged | failed | closed
  result            jsonb,                                 -- engine + redeploy result after merge
  error             text,
  merged_at         timestamptz,
  merged_by         uuid references auth.users(id) on delete set null
);

create index if not exists idx_infra_prs_status
  on public.pending_infrastructure_prs (status, created_at desc);

-- ---------------------------------------------------------------------
-- Immutable audit trail (drafted / merged / failed / closed / redeploy)
-- ---------------------------------------------------------------------
create table if not exists public.infrastructure_pr_audit (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  pr_id       uuid references public.pending_infrastructure_prs(id) on delete cascade,
  actor       uuid references auth.users(id) on delete set null,
  event       text not null,                               -- drafted | merged | failed | closed | redeploy_triggered
  detail      jsonb
);

create index if not exists idx_infra_pr_audit_pr
  on public.infrastructure_pr_audit (pr_id, created_at desc);

-- ---------------------------------------------------------------------
-- RLS: lock both tables down. No permissive policies => anon/auth
-- clients are denied. All access goes through server routes using the
-- service-role key (which bypasses RLS), gated by getCurrentUser().
-- ---------------------------------------------------------------------
alter table public.pending_infrastructure_prs enable row level security;
alter table public.infrastructure_pr_audit    enable row level security;

-- keep-updated_at trigger
create or replace function public.touch_infra_pr_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_infra_pr on public.pending_infrastructure_prs;
create trigger trg_touch_infra_pr
  before update on public.pending_infrastructure_prs
  for each row execute function public.touch_infra_pr_updated_at();
