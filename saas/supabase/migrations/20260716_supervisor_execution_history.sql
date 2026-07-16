create extension if not exists pgcrypto;

create table if not exists public.supervisor_executions (
  id uuid primary key default gen_random_uuid(), execution_id text not null unique, dispatch_id text not null,
  incident_id text not null, plan_id text not null, package_id text, package_fingerprint text,
  provider text not null, target_environment text not null check (target_environment in ('sandbox','preview','production')),
  target_origin text not null, executor_kind text not null check (executor_kind in ('api','browser','manual')),
  execution_mode text not null check (execution_mode in ('dry_run','sandbox_execute')),
  status text not null check (status in ('requested','started','paused_for_approval','continuation_started','completed','failed','verification_failed','rejected','expired','abandoned_after_restart')),
  verification_status text not null check (verification_status in ('pending','verified','failed','not_required')),
  checkpoint_status text not null check (checkpoint_status in ('none','pending_approval','approved','expired','abandoned')),
  approved_step_ids text[] not null default '{}', completed_step_ids text[] not null default '{}', skipped_step_ids text[] not null default '{}',
  started_at timestamptz not null, paused_at timestamptz, completed_at timestamptz, failed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  schema_version text not null, sanitized_error_code text, sanitized_error_message text,
  metadata jsonb not null default '{}',
  constraint supervisor_executions_sandbox_only check (target_environment = 'sandbox'),
  constraint supervisor_executions_completed_verified check (status <> 'completed' or verification_status = 'verified')
);

create table if not exists public.supervisor_audit_events (
  id uuid primary key default gen_random_uuid(), event_id text not null unique, execution_id text,
  dispatch_id text, incident_id text not null, event_type text not null, occurred_at timestamptz not null,
  payload jsonb not null default '{}', schema_version text not null, created_at timestamptz not null default now()
);

create table if not exists public.supervisor_evidence (
  id uuid primary key default gen_random_uuid(), evidence_id text not null unique, execution_id text not null,
  step_id text, evidence_type text not null, artifact_reference text not null, digest text, captured_at timestamptz not null,
  metadata jsonb not null default '{}', schema_version text not null
);

create index if not exists supervisor_executions_created_idx on public.supervisor_executions(created_at desc, execution_id desc);
create index if not exists supervisor_executions_incident_idx on public.supervisor_executions(incident_id);
create index if not exists supervisor_audit_events_execution_idx on public.supervisor_audit_events(execution_id, occurred_at asc);
create index if not exists supervisor_evidence_execution_idx on public.supervisor_evidence(execution_id, captured_at asc);

alter table public.supervisor_executions enable row level security;
alter table public.supervisor_audit_events enable row level security;
alter table public.supervisor_evidence enable row level security;

drop policy if exists "Admins can read supervisor executions" on public.supervisor_executions;
create policy "Admins can read supervisor executions" on public.supervisor_executions for select to authenticated using (public.is_signalboost_admin());
drop policy if exists "Admins can read supervisor audit events" on public.supervisor_audit_events;
create policy "Admins can read supervisor audit events" on public.supervisor_audit_events for select to authenticated using (public.is_signalboost_admin());
drop policy if exists "Admins can read supervisor evidence" on public.supervisor_evidence;
create policy "Admins can read supervisor evidence" on public.supervisor_evidence for select to authenticated using (public.is_signalboost_admin());

comment on table public.supervisor_executions is 'Sanitized durable Mission 001 sandbox execution history. Records are audit-only and cannot authorize replay/resume.';
comment on table public.supervisor_audit_events is 'Immutable sanitized supervisor lifecycle events for operator audit history.';
comment on table public.supervisor_evidence is 'Safe evidence references and digests only; no image binaries, browser state, cookies, tokens, or local paths.';
