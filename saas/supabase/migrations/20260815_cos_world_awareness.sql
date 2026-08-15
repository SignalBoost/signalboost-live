-- Short-term current-awareness memory for frequently refreshed news/world-state signals.
-- This is intentionally separate from durable continuous learning: awareness is ephemeral,
-- does not create an embedding backlog, and expires automatically after a short horizon.

create table if not exists public.cos_world_awareness (
  content_hash text primary key,
  source_uri text not null,
  source_title text not null default '',
  source_host text not null default '',
  snippet text not null default '',
  desk text not null,
  source_kind text not null default 'news_article',
  observed_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists cos_world_awareness_observed_idx
  on public.cos_world_awareness(observed_at desc);

create index if not exists cos_world_awareness_expires_idx
  on public.cos_world_awareness(expires_at);

create index if not exists cos_world_awareness_host_idx
  on public.cos_world_awareness(source_host, observed_at desc);

alter table public.cos_world_awareness enable row level security;
