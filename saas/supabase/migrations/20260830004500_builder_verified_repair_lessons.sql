-- Proven repair lessons only: a route inserts one only after a failed Builder
-- action is followed by a successful proving command in the same turn.
create table if not exists public.builder_verified_repair_lessons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  failure_class text not null check (failure_class in ('storage', 'path', 'runtime', 'dependency', 'test', 'deployment', 'unknown')),
  cause_evidence text not null check (char_length(cause_evidence) between 1 and 2000),
  fix_summary text not null check (char_length(fix_summary) between 1 and 2000),
  regression_command text not null check (char_length(regression_command) between 1 and 2000),
  runtime text not null check (runtime = 'node24-network-denied-ephemeral'),
  created_at timestamptz not null default now(),
  constraint builder_verified_repair_lessons_workspace_user_fkey
    foreign key (workspace_id, user_id)
    references public.builder_workspaces (id, user_id)
    on delete cascade
);

create index if not exists builder_verified_repair_lessons_user_created_idx
  on public.builder_verified_repair_lessons (user_id, created_at desc);

alter table public.builder_verified_repair_lessons enable row level security;
revoke all on public.builder_verified_repair_lessons from anon, authenticated;

comment on table public.builder_verified_repair_lessons is
  'Server-only verified Builder repair lessons. Never stores raw chat history.';
