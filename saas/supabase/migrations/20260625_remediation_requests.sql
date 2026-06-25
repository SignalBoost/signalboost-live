-- saas/supabase/migrations/20260625_remediation_requests.sql
-- Human-approved remediation workflow foundation.
-- Users may request help after an audit/cybersecurity report, but no fix is performed
-- until a human/admin explicitly approves the request.

create table if not exists remediation_requests (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid references auth.users(id) on delete set null,
  source_area               text not null, -- audit | cybersecurity | provider
  source_type               text not null, -- dependency_scan | audit_report | manual
  source_id                 uuid,
  repo                      text,
  target                    text,
  title                     text not null,
  summary                   text not null,
  severity_summary          jsonb not null default '{}'::jsonb,
  findings                  jsonb not null default '[]'::jsonb,
  status                    text not null default 'awaiting_human_review',
  human_approval_required   boolean not null default true,
  human_approved            boolean not null default false,
  approved_by               uuid references auth.users(id) on delete set null,
  approved_at               timestamptz,
  approval_notes            text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create index if not exists remediation_requests_user_idx
  on remediation_requests (user_id, created_at desc);

create index if not exists remediation_requests_status_idx
  on remediation_requests (status, created_at desc);

create index if not exists remediation_requests_source_idx
  on remediation_requests (source_area, source_type, created_at desc);

alter table remediation_requests enable row level security;

create policy "Users read own remediation requests"
  on remediation_requests for select
  using (auth.uid() = user_id);

-- Writes and approvals are performed by owner/admin server routes with the service-role key.
