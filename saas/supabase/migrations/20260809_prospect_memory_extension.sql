-- Prospect Intelligence extension for existing Enterprise Memory.
-- Additive only: no existing enterprise_* table is altered or replaced.

create table if not exists public.prospect_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references public.enterprise_organizations(id) on delete cascade,
  full_name text not null default '',
  role_title text not null default '',
  department text not null default '',
  business_email text not null default '',
  phone text not null default '',
  linkedin_url text not null default '',
  source_type text not null default '',
  source_reference text not null default '',
  verification_status text not null default 'unverified',
  confidence numeric not null default 0,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.prospect_buyer_map (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references public.enterprise_organizations(id) on delete cascade,
  contact_id uuid references public.prospect_contacts(id) on delete set null,
  buyer_role text not null,
  priority integer not null default 100,
  campaign_key text not null default '',
  rationale text not null default '',
  fit_score numeric not null default 0,
  confidence numeric not null default 0,
  source_history jsonb not null default '[]'::jsonb,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, campaign_key, buyer_role)
);

create table if not exists public.prospect_field_freshness (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references public.enterprise_organizations(id) on delete cascade,
  entity_type text not null default 'organization',
  entity_id text not null default '',
  field_key text not null,
  source_type text not null default '',
  source_reference text not null default '',
  confidence numeric not null default 0,
  verified_at timestamptz not null default now(),
  expires_at timestamptz,
  status enterprise_memory_status not null default 'fresh',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, entity_type, entity_id, field_key)
);

create table if not exists public.prospect_outreach_history (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null default 'owner',
  organization_id uuid not null references public.enterprise_organizations(id) on delete cascade,
  contact_id uuid references public.prospect_contacts(id) on delete set null,
  campaign_id text not null default '',
  action text not null,
  channel text not null default 'email',
  provider_message_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists prospect_contacts_org_idx on public.prospect_contacts (organization_id);
create index if not exists prospect_contacts_email_idx on public.prospect_contacts (lower(business_email));
create index if not exists prospect_buyer_map_org_campaign_idx on public.prospect_buyer_map (organization_id, campaign_key, priority);
create index if not exists prospect_field_freshness_expiry_idx on public.prospect_field_freshness (status, expires_at);
create index if not exists prospect_field_freshness_org_idx on public.prospect_field_freshness (organization_id, field_key);
create index if not exists prospect_outreach_history_org_time_idx on public.prospect_outreach_history (organization_id, occurred_at desc);
create index if not exists prospect_outreach_history_campaign_idx on public.prospect_outreach_history (campaign_id, occurred_at desc);

alter table public.prospect_contacts enable row level security;
alter table public.prospect_buyer_map enable row level security;
alter table public.prospect_field_freshness enable row level security;
alter table public.prospect_outreach_history enable row level security;
