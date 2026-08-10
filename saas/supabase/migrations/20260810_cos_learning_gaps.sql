-- Durable queue of knowledge gaps observed by COS-first reasoning.
-- The daily learning cron consumes these rows, studies approved sources, and marks
-- successfully researched gaps resolved. Service-role access is used by COS workers.

create table if not exists public.cos_learning_gaps (
  id uuid primary key default gen_random_uuid(),
  task_id text not null default 'support',
  subject text not null,
  question text not null,
  capability text not null default 'general_reasoning',
  confidence double precision not null default 0 check (confidence >= 0 and confidence <= 1),
  escalation_reason text,
  repeated_count integer not null default 1 check (repeated_count >= 1),
  status text not null default 'pending' check (status in ('pending', 'learning', 'resolved', 'failed')),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (task_id, subject, question, capability)
);

create index if not exists cos_learning_gaps_pending_idx
  on public.cos_learning_gaps(status, last_seen_at desc);

alter table public.cos_learning_gaps enable row level security;
