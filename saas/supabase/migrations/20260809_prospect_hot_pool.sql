-- Prospect hot pool is an index over Enterprise Memory, not a second company database.
-- It keeps the highest-value prospects fast to retrieve while enterprise_organizations
-- remains the canonical organization record.

create table if not exists public.prospect_hot_pool (
  organization_id uuid primary key references public.enterprise_organizations(id) on delete cascade,
  technical_fit numeric not null default 0,
  revenue_potential numeric not null default 0,
  engagement_priority numeric not null default 0,
  data_completeness numeric not null default 0,
  hot_score numeric generated always as (
    (technical_fit * 0.35) +
    (revenue_potential * 0.30) +
    (engagement_priority * 0.25) +
    (data_completeness * 0.10)
  ) stored,
  status text not null default 'ready',
  campaign_keys text[] not null default '{}',
  promoted_at timestamptz not null default now(),
  last_used_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists prospect_hot_pool_score_idx
  on public.prospect_hot_pool(hot_score desc, updated_at desc);

create index if not exists prospect_hot_pool_status_idx
  on public.prospect_hot_pool(status, hot_score desc);

alter table public.prospect_hot_pool enable row level security;
