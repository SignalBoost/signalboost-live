-- SignalBoost SaaS Station production tables for audits, recommendations, rebuilds, quotas, and billing.
create extension if not exists pgcrypto;

create table if not exists public.saas_station_usage_quotas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  module_key text not null,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'demo', 'launch', 'growth', 'command')),
  quota integer not null default 3 check (quota >= 0),
  usage integer not null default 0 check (usage >= 0),
  overage_charges integer not null default 0 check (overage_charges >= 0),
  currency text not null default 'usd',
  billing_provider text not null default 'internal' check (billing_provider in ('stripe', 'paypal', 'internal')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_key, current_period_start)
);

create table if not exists public.saas_station_audits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  module_key text not null,
  subscription_tier text not null default 'free',
  quota integer not null default 3,
  usage integer not null default 0,
  overage_charges integer not null default 0,
  analyzer_score integer not null check (analyzer_score between 0 and 100),
  analyzer_payload jsonb not null default '{}'::jsonb,
  concierge_route jsonb not null default '{}'::jsonb,
  locale text not null default 'en' check (locale in ('en', 'es', 'pt', 'pl', 'ru')),
  created_at timestamptz not null default now()
);

create table if not exists public.saas_station_recommendations (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.saas_station_audits(id) on delete cascade,
  module_key text not null,
  priority text not null check (priority in ('high', 'medium', 'low')),
  title text not null,
  rationale text not null,
  impact_score integer not null check (impact_score between 0 and 100),
  subscription_tier text not null default 'free',
  quota integer not null default 3,
  usage integer not null default 0,
  overage_charges integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.saas_station_rebuilds (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.saas_station_audits(id) on delete cascade,
  module_key text not null,
  mode text not null check (mode in ('demo_playback', 'production_rebuild')),
  can_execute boolean not null default false,
  steps jsonb not null default '[]'::jsonb,
  subscription_tier text not null default 'free',
  quota integer not null default 3,
  usage integer not null default 0,
  overage_charges integer not null default 0,
  created_at timestamptz not null default now(),
  executed_at timestamptz
);

create table if not exists public.saas_station_billing_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  module_key text not null,
  subscription_tier text not null default 'free',
  quota integer not null default 3,
  usage integer not null default 0,
  overage_units integer not null default 0,
  overage_charges integer not null default 0,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  provider text not null check (provider in ('stripe', 'paypal', 'internal')),
  status text not null check (status in ('not_required', 'charged', 'requires_checkout', 'configured_fallback')),
  checkout_url text,
  invoice_reference text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists saas_station_audits_user_module_idx on public.saas_station_audits(user_id, module_key, created_at desc);
create index if not exists saas_station_billing_user_module_idx on public.saas_station_billing_events(user_id, module_key, created_at desc);
create index if not exists saas_station_rebuilds_audit_idx on public.saas_station_rebuilds(audit_id);

alter table public.saas_station_usage_quotas enable row level security;
alter table public.saas_station_audits enable row level security;
alter table public.saas_station_recommendations enable row level security;
alter table public.saas_station_rebuilds enable row level security;
alter table public.saas_station_billing_events enable row level security;

drop policy if exists "Users can read own SaaS Station quotas" on public.saas_station_usage_quotas;
drop policy if exists "Users can read own SaaS Station audits" on public.saas_station_audits;
drop policy if exists "Users can read own SaaS Station recommendations" on public.saas_station_recommendations;
drop policy if exists "Users can read own SaaS Station rebuilds" on public.saas_station_rebuilds;
drop policy if exists "Users can read own SaaS Station billing" on public.saas_station_billing_events;

create policy "Users can read own SaaS Station quotas" on public.saas_station_usage_quotas for select using (auth.uid() = user_id);
create policy "Users can read own SaaS Station audits" on public.saas_station_audits for select using (auth.uid() = user_id);
create policy "Users can read own SaaS Station recommendations" on public.saas_station_recommendations for select using (
  exists (select 1 from public.saas_station_audits a where a.id = audit_id and a.user_id = auth.uid())
);
create policy "Users can read own SaaS Station rebuilds" on public.saas_station_rebuilds for select using (
  exists (select 1 from public.saas_station_audits a where a.id = audit_id and a.user_id = auth.uid())
);
create policy "Users can read own SaaS Station billing" on public.saas_station_billing_events for select using (auth.uid() = user_id);
