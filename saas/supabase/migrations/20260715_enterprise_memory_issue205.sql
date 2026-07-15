-- Issue #205 Enterprise Memory persistent cache
create extension if not exists pgcrypto;

do $$ begin
  create type enterprise_memory_status as enum ('fresh','stale','refreshing','failed','invalidated','partial');
exception when duplicate_object then null; end $$;

create table if not exists enterprise_organizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  canonical_domain text not null unique,
  name text not null default '',
  aliases text[] not null default '{}',
  source_type text not null default 'website',
  industry text not null default '',
  profile jsonb not null default '{}'::jsonb,
  brand_voice jsonb not null default '{}'::jsonb,
  brand_positioning jsonb not null default '{}'::jsonb,
  value_propositions jsonb not null default '[]'::jsonb,
  products_services jsonb not null default '[]'::jsonb,
  target_audiences jsonb not null default '[]'::jsonb,
  geographic_markets text[] not null default '{}',
  supported_languages text[] not null default '{}',
  source_history jsonb not null default '[]'::jsonb,
  confidence numeric not null default 0,
  cache_version integer not null default 1,
  status enterprise_memory_status not null default 'fresh',
  profile_refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists enterprise_organization_aliases (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references enterprise_organizations(id) on delete cascade,
  alias text not null,
  source text not null default '',
  created_at timestamptz not null default now(),
  unique (organization_id, alias)
);

create table if not exists enterprise_url_fingerprints (
  fingerprint text primary key,
  tenant_id text not null default 'owner',
  organization_id uuid not null references enterprise_organizations(id) on delete cascade,
  source_url text not null,
  canonical_url text not null,
  normalized_url text generated always as (canonical_url) stored,
  status enterprise_memory_status not null default 'fresh',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists enterprise_intelligence_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references enterprise_organizations(id) on delete cascade,
  workspace text not null,
  snapshot jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  source_history jsonb not null default '[]'::jsonb,
  schema_version integer not null default 1,
  status enterprise_memory_status not null default 'fresh',
  analyzed_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, workspace)
);

create table if not exists enterprise_repository_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references enterprise_organizations(id) on delete cascade,
  repo_owner text not null,
  repo_name text not null,
  default_branch text not null default '',
  primary_languages jsonb not null default '[]'::jsonb,
  frameworks jsonb not null default '[]'::jsonb,
  package_managers jsonb not null default '[]'::jsonb,
  dependencies jsonb not null default '{}'::jsonb,
  topics jsonb not null default '[]'::jsonb,
  readme_intelligence jsonb not null default '{}'::jsonb,
  product_descriptions jsonb not null default '[]'::jsonb,
  deployment_configuration jsonb not null default '{}'::jsonb,
  last_analyzed_commit text not null default '',
  last_analyzed_commit_sha text not null default '',
  last_repository_update timestamptz,
  repository_fingerprint text not null default '',
  intelligence_confidence numeric not null default 0,
  analysis_version integer not null default 1,
  status enterprise_memory_status not null default 'fresh',
  analyzed_at timestamptz not null default now(),
  expires_at timestamptz,
  unique (organization_id, repo_owner, repo_name)
);

create table if not exists enterprise_campaign_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references enterprise_organizations(id) on delete cascade,
  campaign_id text not null,
  workspace text not null default '',
  objective text not null default '',
  selected_audience text not null default '',
  selected_product text not null default '',
  suggestions jsonb not null default '[]'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  human_edits jsonb not null default '{}'::jsonb,
  approved_version jsonb,
  rejected_suggestions jsonb not null default '[]'::jsonb,
  approval_decision text not null default '',
  approval_evidence text not null default '',
  approved_at timestamptz,
  execution_status text not null default 'draft',
  channel text not null default '',
  cta text not null default '',
  creative text not null default '',
  content_hash text not null default '',
  performance_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, campaign_id)
);

create table if not exists enterprise_approval_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references enterprise_organizations(id) on delete cascade,
  campaign_id text not null,
  decision text not null,
  approved_version jsonb,
  content_hash text not null default '',
  evidence text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists enterprise_confidence_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references enterprise_organizations(id) on delete cascade,
  workspace text not null default '',
  confidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists enterprise_memory_refresh_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  fingerprint text not null,
  organization_id uuid references enterprise_organizations(id) on delete set null,
  status text not null default 'running',
  idempotency_key text generated always as (fingerprint || ':' || status) stored,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists enterprise_memory_one_running_refresh_idx on enterprise_memory_refresh_jobs (fingerprint) where status = 'running';
create index if not exists enterprise_organizations_canonical_domain_idx on enterprise_organizations (canonical_domain);
create index if not exists enterprise_url_fingerprints_org_idx on enterprise_url_fingerprints (organization_id);
create index if not exists enterprise_intelligence_org_status_idx on enterprise_intelligence_snapshots (organization_id, status);
create index if not exists enterprise_intelligence_refreshed_idx on enterprise_intelligence_snapshots (analyzed_at);
create index if not exists enterprise_repository_commit_idx on enterprise_repository_snapshots (last_analyzed_commit_sha);
create index if not exists enterprise_repository_org_idx on enterprise_repository_snapshots (organization_id);
create index if not exists enterprise_campaign_memory_campaign_idx on enterprise_campaign_memory (campaign_id);
create index if not exists enterprise_campaign_memory_org_idx on enterprise_campaign_memory (organization_id);
create index if not exists enterprise_campaign_memory_status_idx on enterprise_campaign_memory (execution_status);

alter table enterprise_organizations enable row level security;
alter table enterprise_organization_aliases enable row level security;
alter table enterprise_url_fingerprints enable row level security;
alter table enterprise_intelligence_snapshots enable row level security;
alter table enterprise_repository_snapshots enable row level security;
alter table enterprise_campaign_memory enable row level security;
alter table enterprise_approval_history enable row level security;
alter table enterprise_confidence_history enable row level security;
alter table enterprise_memory_refresh_jobs enable row level security;
