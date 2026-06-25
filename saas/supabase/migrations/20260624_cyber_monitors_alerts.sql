-- saas/supabase/migrations/20260624_cyber_monitors_alerts.sql
-- Cybersecurity monitoring foundation: configured repositories + alert inbox.

create table if not exists cyber_monitored_repositories (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  label               text,
  repo_url            text not null,
  repo                text,
  branch              text,
  frequency           text not null default 'daily', -- daily | weekly
  is_enabled          boolean not null default true,
  last_scan_at        timestamptz,
  last_status         text,
  last_error          text,
  last_advisories     integer not null default 0,
  last_critical       integer not null default 0,
  last_high           integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists cyber_alerts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users(id) on delete set null,
  monitor_id          uuid references cyber_monitored_repositories(id) on delete cascade,
  scan_id             uuid references cyber_dependency_scans(id) on delete set null,
  repo                text,
  severity            text not null,
  advisory_id         text,
  package_name        text,
  package_version     text,
  title               text not null,
  message             text not null,
  details_url         text,
  status              text not null default 'open', -- open | resolved | ignored
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz
);

create index if not exists cyber_monitored_repositories_user_idx on cyber_monitored_repositories (user_id, created_at desc);
create index if not exists cyber_monitored_repositories_enabled_idx on cyber_monitored_repositories (is_enabled, last_scan_at);
create index if not exists cyber_alerts_user_status_idx on cyber_alerts (user_id, status, created_at desc);
create index if not exists cyber_alerts_monitor_idx on cyber_alerts (monitor_id, created_at desc);

-- Prevent duplicate open alerts for the same vulnerable package/advisory on a monitor.
create unique index if not exists cyber_alerts_open_unique_idx
  on cyber_alerts (monitor_id, advisory_id, package_name, package_version)
  where status = 'open';

alter table cyber_monitored_repositories enable row level security;
alter table cyber_alerts enable row level security;

create policy "Users read own cyber monitors"
  on cyber_monitored_repositories for select
  using (auth.uid() = user_id);

create policy "Users read own cyber alerts"
  on cyber_alerts for select
  using (auth.uid() = user_id);

-- Writes are performed by owner/admin server routes with the service-role key.
