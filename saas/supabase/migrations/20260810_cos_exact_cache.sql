create table if not exists public.cos_exact_cache (
  cache_key text primary key,
  value jsonb not null,
  created_at_ms bigint not null,
  expires_at_ms bigint null,
  updated_at timestamptz not null default now()
);

create index if not exists cos_exact_cache_expires_idx
  on public.cos_exact_cache (expires_at_ms)
  where expires_at_ms is not null;

alter table public.cos_exact_cache enable row level security;

revoke all on public.cos_exact_cache from anon, authenticated;
