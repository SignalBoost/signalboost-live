create table if not exists public.business_intelligence_corpus (
  id uuid primary key default gen_random_uuid(),
  canonical_domain text not null unique,
  company_name text not null default '',
  aliases jsonb not null default '[]'::jsonb,
  industry text,
  country text,
  region text,
  employee_count integer,
  revenue_usd numeric,
  website text,
  description text,
  technologies jsonb not null default '[]'::jsonb,
  contacts jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  source_type text not null default 'curated',
  source_ids jsonb not null default '[]'::jsonb,
  verified_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bic_company_name_idx on public.business_intelligence_corpus using gin (to_tsvector('simple', company_name));
create index if not exists bic_confidence_idx on public.business_intelligence_corpus (confidence desc);
create index if not exists bic_expires_idx on public.business_intelligence_corpus (expires_at);
create index if not exists bic_country_industry_idx on public.business_intelligence_corpus (country, industry);

create table if not exists public.business_intelligence_corpus_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  corpus_id uuid references public.business_intelligence_corpus(id) on delete cascade,
  canonical_domain text not null,
  reason text not null,
  priority integer not null default 50,
  status text not null default 'queued',
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

create unique index if not exists bic_refresh_one_active_per_domain
  on public.business_intelligence_corpus_refresh_queue (canonical_domain)
  where status in ('queued','running');

create table if not exists public.business_intelligence_corpus_metrics (
  id uuid primary key default gen_random_uuid(),
  query_text text not null default '',
  canonical_domain text,
  internal_hit boolean not null default false,
  sufficient boolean not null default false,
  provider_called boolean not null default false,
  provider_id text,
  confidence numeric not null default 0 check (confidence >= 0 and confidence <= 1),
  latency_ms integer not null default 0,
  outcome text not null default 'not_found',
  created_at timestamptz not null default now()
);

create index if not exists bic_metrics_created_idx on public.business_intelligence_corpus_metrics (created_at desc);
create index if not exists bic_metrics_provider_idx on public.business_intelligence_corpus_metrics (provider_called, provider_id);
create index if not exists bic_metrics_internal_idx on public.business_intelligence_corpus_metrics (internal_hit, sufficient);

alter table public.business_intelligence_corpus enable row level security;
alter table public.business_intelligence_corpus_refresh_queue enable row level security;
alter table public.business_intelligence_corpus_metrics enable row level security;

comment on table public.business_intelligence_corpus is 'SignalBoost internal-first reusable company intelligence corpus. Service-role access only.';
comment on table public.business_intelligence_corpus_refresh_queue is 'Background refresh/enrichment work for stale or insufficient corpus records.';
comment on table public.business_intelligence_corpus_metrics is 'Internal-first lookup and provider-avoidance evidence for the Business Intelligence Corpus.';
