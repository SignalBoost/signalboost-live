-- One durable, owner-approved remediation batch per audit run.  The unique
-- run_id is the server-side at-most-once guard for the global approval action.
create table if not exists public.audit_run_fix_batches (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.audit_runs(id) on delete cascade,
  approved_by uuid not null,
  approved_at timestamptz not null default now(),
  status text not null default 'applying' check (status in ('applying', 'completed', 'failed')),
  files_fixed integer not null default 0,
  findings_fixed integer not null default 0,
  completed_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_run_fix_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.audit_run_fix_batches(id) on delete cascade,
  file text not null,
  line integer,
  action text not null,
  timestamp timestamptz not null default now()
);

alter table public.audit_run_fix_batches enable row level security;
alter table public.audit_run_fix_events enable row level security;
-- The owner-gated API writes through the service-role client. No browser write
-- policy is intentionally granted.
