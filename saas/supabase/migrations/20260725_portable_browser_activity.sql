-- Durable, redacted operational activity for the Browser Agent Ecosystem.
-- No URLs, credentials, page content, screenshots, prompts, or browser evidence are stored.

create table if not exists public.portable_browser_activity (
  id uuid primary key default gen_random_uuid(),
  runtime_id text not null,
  event_type text not null check (event_type in ('runtime_created', 'session_started', 'session_completed', 'session_failed')),
  provider_id text,
  adapter_id text,
  outcome text,
  created_at timestamptz not null default now()
);

create index if not exists portable_browser_activity_created_at_idx
  on public.portable_browser_activity (created_at desc);

alter table public.portable_browser_activity enable row level security;

comment on table public.portable_browser_activity is
  'Redacted Browser Agent Ecosystem operational activity. Stores identifiers and outcomes only; never credentials, URLs, page content, screenshots, prompts, or evidence.';
