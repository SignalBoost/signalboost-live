-- saas/supabase/migrations/20260728_supervisor_demo_records.sql
--
-- PUBLISHED DEMO RECORDS.
--
-- A prospective buyer cannot log in to the operator console, so the demo is otherwise only
-- viewable over a screen share. This table holds records the owner has explicitly PUBLISHED
-- from a rehearsal or drill run, so a read-only page can serve them to someone holding a
-- share link.
--
-- WHAT GOES IN HERE IS PUBLISHED ON PURPOSE. Nothing writes to this table automatically —
-- only an explicit owner action does. A record that lands here is one a stranger may read,
-- so the publishing route redacts infrastructure identifiers before insert and the check
-- constraint below refuses the obvious leaks outright. Defence in depth: the redaction is
-- the control, this constraint is the backstop for when someone changes the route.
--
-- kind: which demonstration produced it. 'rehearsal' = the acceptance scenario (approval
-- gating, notification, audit). 'drill' = a synthetic incident through the real intake path.
-- Production repair history is deliberately NOT publishable — it describes real
-- infrastructure and belongs to the deployment, not to a sales conversation.

create table if not exists public.supervisor_demo_records (
  record_id text primary key,
  kind text not null check (kind in ('rehearsal', 'drill')),
  share_token_hash text not null,
  title text not null,
  published_by text not null,
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  schema_version text not null default 'supervisor-demo-record-v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The share token is never stored in the clear: the page is reached by presenting the
  -- token, and a leaked table should not hand someone every live link.
  constraint supervisor_demo_records_token_hashed check (share_token_hash ~ '^[0-9a-f]{64}$'),

  -- Backstop against the publishing route regressing. These keys carry deployment identity
  -- and must be redacted before a record is published.
  constraint supervisor_demo_records_no_infrastructure check (
    not (payload ? 'projectId')
    and not (payload ? 'deploymentId')
    and not (payload ? 'approverAddresses')
    and not (payload ? 'ownerEmails')
  )
);

create index if not exists supervisor_demo_records_token_idx
  on public.supervisor_demo_records (share_token_hash)
  where revoked_at is null;

create index if not exists supervisor_demo_records_published_idx
  on public.supervisor_demo_records (published_at desc);

-- Read access is served exclusively through the server-side route, which holds the service
-- key and checks the token, expiry and revocation. No anonymous client should reach this
-- table directly.
alter table public.supervisor_demo_records enable row level security;
