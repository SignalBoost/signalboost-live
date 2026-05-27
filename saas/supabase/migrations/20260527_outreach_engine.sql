create table if not exists public.outreach_discovery (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  category text,
  location text,
  business_name text not null,
  website text,
  social_links jsonb not null default '[]'::jsonb,
  email text,
  phone text,
  address text,
  confidence_score numeric(5,2) default 0,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  discovery_id uuid references public.outreach_discovery(id) on delete cascade,
  owner_email text,
  contact_form_url text,
  instagram_dm_link text,
  facebook_page text,
  phone text,
  normalized_methods jsonb not null default '{}'::jsonb
);

create table if not exists public.outreach_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contact_id uuid references public.outreach_contacts(id) on delete cascade,
  channel text not null,
  message_subject text,
  message_body text,
  personalization jsonb not null default '{}'::jsonb,
  throttle_bucket text,
  compliance_status text not null default 'pending',
  send_status text not null default 'queued',
  opt_out boolean not null default false,
  send_logs jsonb not null default '[]'::jsonb
);

create table if not exists public.outreach_pipeline (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  discovery_id uuid references public.outreach_discovery(id) on delete cascade,
  contact_id uuid references public.outreach_contacts(id) on delete set null,
  stage text not null default 'discovered',
  opened_at timestamptz,
  replied_at timestamptz,
  booked_call_at timestamptz,
  closed_won_at timestamptz,
  timeline jsonb not null default '[]'::jsonb
);
