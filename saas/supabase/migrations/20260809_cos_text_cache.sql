-- Durable exact reuse for legacy COS text generators while they migrate to cos-core.
create table if not exists public.cos_text_cache (
  cache_key text primary key,
  task_id text not null,
  response_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cos_text_cache_task_updated_idx
  on public.cos_text_cache(task_id, updated_at desc);

alter table public.cos_text_cache enable row level security;
