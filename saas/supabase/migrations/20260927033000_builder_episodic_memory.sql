-- Durable, user-scoped episodic memory for Builder. Stores bounded verified execution summaries,
-- never credentials, raw browser state, or cross-user data.
create table if not exists public.builder_episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid not null,
  workspace_id uuid not null,
  job_id uuid not null unique,
  objective text not null check (char_length(objective) between 1 and 2000),
  outcome text not null check (outcome in ('succeeded','failed')),
  summary text not null check (char_length(summary) between 1 and 4000),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists builder_episodes_user_recent_idx on public.builder_episodes(user_id, created_at desc);
create index if not exists builder_episodes_user_workspace_idx on public.builder_episodes(user_id, workspace_id, created_at desc);
alter table public.builder_episodes enable row level security;
revoke all on public.builder_episodes from anon, authenticated;
comment on table public.builder_episodes is 'Server-owned bounded Builder episodic memory; retrieval is always fenced by user_id.';
