-- saas/supabase/migrations/20260622_audit_finding_state.sql
--
-- Per-finding triage state for the Audit Center. Keyed by the deterministic,
-- run-stable finding id (provider+category+messageKey+params), so "mark
-- resolved" / "assign owner" persist across re-scans. Separate from
-- audit_readiness_runs (score history) and hub_audit_log (action log).

create table if not exists audit_finding_state (
  finding_id  text primary key,
  status      text not null default 'open',
  owner       text,
  note        text,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table audit_finding_state enable row level security;
-- Writes come from owner-gated server routes using the service-role key.
-- Add an owner/admin read policy as appropriate for your deployment.
