-- saas/supabase/migrations/20260623_cyber_dependency_scans.sql
-- Stores Cybersecurity Center dependency advisory scan summaries.
-- Full report JSON is stored for history/detail export; secret values are never stored here.

create table if not exists cyber_dependency_scans (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid references auth.users(id) on delete set null,
  target             text not null,
  repo               text,
  branch             text,
  packages_scanned   integer not null default 0,
  advisories_count   integer not null default 0,
  critical           integer not null default 0,
  high               integer not null default 0,
  medium             integer not null default 0,
  low                integer not null default 0,
  unknown            integer not null default 0,
  report             jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

create index if not exists cyber_dependency_scans_user_idx on cyber_dependency_scans (user_id, created_at desc);
create index if not exists cyber_dependency_scans_repo_idx on cyber_dependency_scans (repo, created_at desc);

alter table cyber_dependency_scans enable row level security;

-- End users can read only their own scan summaries. Owner/admin server routes use
-- the service-role key for full dashboard access.
create policy "Users read own cyber dependency scans"
  on cyber_dependency_scans for select
  using (auth.uid() = user_id);
