-- supabase/migrations/20260805_outreach_approval_identity.sql
--
-- APPROVAL IDENTITY for the sales outreach pipeline: every approval carries an ID number,
-- a KIND, and a DATE (owner requirement, Aug 5 2026).
--
-- outreach_queue predates approval identities and, unlike the other approval stores, has no
-- metadata jsonb to tuck them into — so they become real columns. approved_at already exists
-- and remains the DECIDED date; approval_requested_at records when the record entered the
-- queue, which is a different question an audit must be able to answer separately.
--
-- Idempotent on purpose: safe to run twice.
alter table public.outreach_queue
  add column if not exists approval_ref text,
  add column if not exists approval_kind text,
  add column if not exists approval_requested_at timestamptz;

comment on column public.outreach_queue.approval_ref is 'Human-readable approval reference, e.g. SO-20260805-K7Q4M. Minted once, never rewritten.';
comment on column public.outreach_queue.approval_kind is 'Owning approval pipeline. Always sales_outreach for this table; stored so cross-pipeline tooling can check without joins.';
comment on column public.outreach_queue.approval_requested_at is 'When the record entered the approval queue. approved_at stays the decision date.';

create index if not exists outreach_queue_approval_ref_idx on public.outreach_queue(approval_ref);
