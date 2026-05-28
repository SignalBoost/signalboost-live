create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

create table if not exists public.ai_local_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text,
  zone text,
  founded text,
  colors text[] not null default '{}',
  description text not null default '',
  language text not null default 'en',
  user_prompt text not null default '',
  created_at timestamptz not null default now(),
  quality_score numeric
);

create index if not exists ai_local_items_language_created_idx
  on public.ai_local_items (language, created_at desc);

create index if not exists ai_local_items_user_prompt_trgm_idx
  on public.ai_local_items using gin (user_prompt gin_trgm_ops);

create table if not exists public.ai_business_sites (
  id uuid primary key default gen_random_uuid(),
  site_json jsonb not null,
  language text not null default 'en',
  user_prompt text not null default '',
  created_at timestamptz not null default now(),
  quality_score numeric
);

create index if not exists ai_business_sites_language_prompt_created_idx
  on public.ai_business_sites (language, user_prompt, created_at desc);
