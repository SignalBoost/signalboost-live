-- Mission 001: durable at-most-once Supervisor dispatch claims.
-- The primary key is the cross-process and cross-region serialization boundary.

create table if not exists public.supervisor_dispatch_ledger (
  dispatch_id text primary key,
  incident_id text not null,
  executor_kind text not null check (executor_kind in ('api', 'browser', 'manual')),
  work_item_id text,
  execution_id text,
  status text not null default 'claimed' check (status in ('claimed', 'completed', 'failed', 'rejected')),
  claimed_at timestamptz not null,
  completed_at timestamptz,
  schema_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists supervisor_dispatch_ledger_incident_idx
  on public.supervisor_dispatch_ledger (incident_id, claimed_at desc);

create index if not exists supervisor_dispatch_ledger_work_item_idx
  on public.supervisor_dispatch_ledger (work_item_id)
  where work_item_id is not null;

alter table public.supervisor_dispatch_ledger enable row level security;

-- Internal service-role infrastructure only. No public policies.
comment on table public.supervisor_dispatch_ledger is
  'Durable at-most-once Supervisor dispatch claims. Contains identifiers and status only; never credentials or provider payloads.';
