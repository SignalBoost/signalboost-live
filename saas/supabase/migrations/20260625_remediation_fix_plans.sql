-- saas/supabase/migrations/20260625_remediation_fix_plans.sql
-- Adds the next human-control layer after a remediation request is approved.
-- Approval creates/reveals a fix plan, but still does not change code or open a PR.

alter table if exists remediation_requests
  add column if not exists fix_plan jsonb not null default '{}'::jsonb,
  add column if not exists fix_plan_status text not null default 'not_started',
  add column if not exists fix_plan_created_at timestamptz,
  add column if not exists fix_plan_approved boolean not null default false,
  add column if not exists fix_plan_approved_at timestamptz,
  add column if not exists implementation_status text not null default 'not_started',
  add column if not exists implementation_notes text,
  add column if not exists pull_request_url text;

create index if not exists remediation_requests_fix_plan_status_idx
  on remediation_requests (fix_plan_status, created_at desc);
