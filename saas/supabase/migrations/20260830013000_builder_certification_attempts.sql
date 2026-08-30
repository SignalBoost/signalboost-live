-- Evidence-only Builder graduation records. No prompts, source code, commands,
-- outputs, or model answers are retained here.
create table if not exists public.builder_certification_attempts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null check (case_id in ('create_and_run_javascript_v1', 'inspect_repair_and_run_v1', 'observe_failure_and_recover_v1')),
  passed boolean not null,
  reason_codes jsonb not null default '[]'::jsonb check (jsonb_typeof(reason_codes) = 'array'),
  created_at timestamptz not null default now(),
  constraint builder_certification_attempts_workspace_user_fkey
    foreign key (workspace_id, user_id)
    references public.builder_workspaces (id, user_id)
    on delete cascade
);

create index if not exists builder_certification_attempts_user_case_created_idx
  on public.builder_certification_attempts (user_id, case_id, created_at desc);

alter table public.builder_certification_attempts enable row level security;
revoke all on public.builder_certification_attempts from anon, authenticated;

comment on table public.builder_certification_attempts is
  'Server-only evidence-only Builder certification outcomes; no user source or chat content.';
