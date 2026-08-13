-- Durable loop guard and next-cycle verification for unattended Self-Healing repairs.
-- Service-role only: no browser/client policies are created.

create table if not exists public.self_healing_remediation_verifications (
  recovery_key text primary key,
  incident_id text not null,
  provider text not null,
  environment text not null,
  error_code text,
  affected_resource text,
  repair_outcome text not null check (repair_outcome in ('executed','staged','no_action','unavailable')),
  verification_status text not null check (verification_status in ('pending','verified','failed')),
  automatic_attempts integer not null default 0 check (automatic_attempts >= 0),
  verification_checks integer not null default 0 check (verification_checks >= 0),
  first_attempted_at timestamptz not null default now(),
  last_attempted_at timestamptz not null default now(),
  last_checked_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists self_healing_remediation_verifications_status_idx
  on public.self_healing_remediation_verifications (verification_status, updated_at desc);

alter table public.self_healing_remediation_verifications enable row level security;
