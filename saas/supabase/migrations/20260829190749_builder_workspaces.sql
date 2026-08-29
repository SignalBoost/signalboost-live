-- Durable, server-only files for the authenticated COS Builder surface.
-- Browser roles have no table grants or policies; API routes enforce ownership
-- before using the service-role client.

create table if not exists public.builder_workspaces (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint builder_workspaces_id_user_unique unique (id, user_id)
);

create table if not exists public.builder_workspace_files (
  workspace_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  content text not null,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, path),
  constraint builder_workspace_files_workspace_user_fkey
    foreign key (workspace_id, user_id)
    references public.builder_workspaces (id, user_id)
    on delete cascade,
  constraint builder_workspace_files_path_check
    check (char_length(path) between 1 and 240 and path !~ '(^|/)\\.{1,2}(/|$)'),
  constraint builder_workspace_files_content_size_check
    check (octet_length(content) <= 524288),
  constraint builder_workspace_files_content_nul_check
    check (position(chr(0) in content) = 0)
);

create index if not exists builder_workspaces_user_updated_idx
  on public.builder_workspaces (user_id, updated_at desc);

alter table public.builder_workspaces enable row level security;
alter table public.builder_workspace_files enable row level security;

revoke all on public.builder_workspaces from anon, authenticated;
revoke all on public.builder_workspace_files from anon, authenticated;

comment on table public.builder_workspaces is
  'Server-only authenticated user workspaces for COS Builder.';
comment on table public.builder_workspace_files is
  'Server-only source files for COS Builder workspaces.';