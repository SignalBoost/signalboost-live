create extension if not exists "uuid-ossp";
create extension if not exists vector;

create table if not exists public.website_audits (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references public.accounts(id) on delete cascade,
  url text not null,
  performance_score integer check (performance_score between 0 and 100),
  seo_score integer check (seo_score between 0 and 100),
  accessibility_score integer check (accessibility_score between 0 and 100),
  mobile_score integer check (mobile_score between 0 and 100),
  conversion_score integer check (conversion_score between 0 and 100),
  security_score integer check (security_score between 0 and 100),
  raw_report jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.website_recommendations (
  id uuid primary key default uuid_generate_v4(),
  audit_id uuid not null references public.website_audits(id) on delete cascade,
  category text not null check (category in ('performance','seo','accessibility','mobile','conversion','security')),
  priority text not null check (priority in ('high','medium','low')),
  recommendation text not null,
  suggested_fix jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

create table if not exists public.website_rebuilds (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references public.accounts(id) on delete cascade,
  source_url text,
  status text check (status in ('pending','generated','applied')) default 'pending',
  generated_structure jsonb not null default '{}'::jsonb,
  generated_content jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create table if not exists public.concierge_knowledge (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  content text not null,
  embedding vector(1536),
  created_at timestamp with time zone default now()
);

create table if not exists public.concierge_intents (
  id uuid primary key default uuid_generate_v4(),
  account_id uuid references public.accounts(id) on delete cascade,
  raw_input text,
  cleaned_input text,
  intent text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_website_audits_account_created on public.website_audits(account_id, created_at desc);
create index if not exists idx_website_audits_url on public.website_audits(url);
create index if not exists idx_website_recommendations_audit on public.website_recommendations(audit_id);
create index if not exists idx_website_recommendations_category on public.website_recommendations(category);
create index if not exists idx_website_recommendations_priority on public.website_recommendations(priority);
create index if not exists idx_website_rebuilds_account_created on public.website_rebuilds(account_id, created_at desc);
create index if not exists idx_website_rebuilds_status on public.website_rebuilds(status);
create index if not exists idx_concierge_knowledge_category on public.concierge_knowledge(category);
create index if not exists idx_concierge_intents_account_created on public.concierge_intents(account_id, created_at desc);
create index if not exists idx_concierge_intents_intent on public.concierge_intents(intent);
create index if not exists idx_concierge_knowledge_embedding on public.concierge_knowledge using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.set_website_rebuilds_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_website_rebuilds_updated_at on public.website_rebuilds;
create trigger trg_website_rebuilds_updated_at
before update on public.website_rebuilds
for each row execute function public.set_website_rebuilds_updated_at();

insert into public.concierge_knowledge(category, content)
values
  ('modules', 'SignalBoost Websites analyzes performance, SEO, accessibility, mobile, conversion, and security; it can optimize copy and generate rebuild plans.'),
  ('product', 'SignalBoost SaaS Station includes Calendar, Spreadsheets, Promote, Websites, Outreach, Reviews, and Personal Assistant modules.'),
  ('pricing', 'SignalBoost pricing is surfaced through the Pricing route and can be explained by Concierge with module-specific recommendations.')
on conflict do nothing;
