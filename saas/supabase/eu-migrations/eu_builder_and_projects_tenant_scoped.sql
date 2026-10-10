-- Applied to the Frankfurt EU project; mirrors the minimal Builder/project fields,
-- but stores EU-specific tenant IDs and never trusts caller-selected tenant ownership.
create table if not exists public.eu_builder_workspaces (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 tenant_id text not null references public.eu_tenant_assignments(tenant_id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 objective text check (objective is null or char_length(objective)<=500),
 unique(id,user_id,tenant_id)
);
create table if not exists public.eu_builder_workspace_files (
 workspace_id uuid not null,
 user_id uuid not null,
 tenant_id text not null,
 path text not null check (char_length(path) between 1 and 240 and path !~ '(^|/)\.{1,2}(/|$)'),
 content text not null check (octet_length(content)<=524288),
 updated_at timestamptz not null default now(),
 primary key(workspace_id,path),
 foreign key(workspace_id,user_id,tenant_id) references public.eu_builder_workspaces(id,user_id,tenant_id) on delete cascade
);
create table if not exists public.eu_projects (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 tenant_id text not null references public.eu_tenant_assignments(tenant_id),
 name text, type text default 'website',language text default 'en',status text default 'draft',
 content jsonb,handle text unique,
 created_at timestamptz default now(),last_edited_at timestamptz default now()
);
alter table public.eu_builder_workspaces enable row level security;
alter table public.eu_builder_workspace_files enable row level security;
alter table public.eu_projects enable row level security;
revoke all on public.eu_builder_workspaces,public.eu_builder_workspace_files,public.eu_projects from public,anon,authenticated;
grant select,insert,update,delete on public.eu_builder_workspaces,public.eu_builder_workspace_files,public.eu_projects to authenticated;
drop policy if exists "eu builder owner all" on public.eu_builder_workspaces;
create policy "eu builder owner all" on public.eu_builder_workspaces for all to authenticated
using ((select auth.uid())=user_id and exists(select 1 from public.eu_auth_profiles a where a.user_id=(select auth.uid()) and a.tenant_id=eu_builder_workspaces.tenant_id))
with check ((select auth.uid())=user_id and exists(select 1 from public.eu_auth_profiles a where a.user_id=(select auth.uid()) and a.tenant_id=eu_builder_workspaces.tenant_id));
drop policy if exists "eu workspace files owner all" on public.eu_builder_workspace_files;
create policy "eu workspace files owner all" on public.eu_builder_workspace_files for all to authenticated
using ((select auth.uid())=user_id and exists(select 1 from public.eu_auth_profiles a where a.user_id=(select auth.uid()) and a.tenant_id=eu_builder_workspace_files.tenant_id))
with check ((select auth.uid())=user_id and exists(select 1 from public.eu_auth_profiles a where a.user_id=(select auth.uid()) and a.tenant_id=eu_builder_workspace_files.tenant_id));
drop policy if exists "eu projects owner all" on public.eu_projects;
create policy "eu projects owner all" on public.eu_projects for all to authenticated
using ((select auth.uid())=user_id and exists(select 1 from public.eu_auth_profiles a where a.user_id=(select auth.uid()) and a.tenant_id=eu_projects.tenant_id))
with check ((select auth.uid())=user_id and exists(select 1 from public.eu_auth_profiles a where a.user_id=(select auth.uid()) and a.tenant_id=eu_projects.tenant_id));
