create table if not exists public.cos_exact_cache (
  cache_key text primary key,
  value jsonb not null,
  created_at_ms bigint not null,
  expires_at_ms bigint,
  updated_at timestamptz not null default now()
);

create index if not exists cos_exact_cache_updated_idx
  on public.cos_exact_cache(updated_at desc);

alter table public.cos_exact_cache enable row level security;
