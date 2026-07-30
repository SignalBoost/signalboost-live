-- saas/supabase/migrations/20260730_outreach_queue_sent_at.sql
--
-- RESTORE THE MISSING sent_at COLUMN ON outreach_queue.
--
-- 20260528_ai_outreach_adm.sql declares sent_at in its `create table` block, but the
-- live table predates that declaration, so the column was never actually added — a
-- create-table-if-not-exists never backfills columns onto a table that already exists.
-- The result showed up in a real batch send on 2026-07-30: every row came back with
--   "Could not find the 'sent_at' column of 'outreach_queue' in the schema cache"
-- and the route fell back to writing status='sent' with no timestamp. The emails went
-- out and outreach_sends recorded them correctly, so nothing was lost, but the queue
-- itself cannot answer "when was this sent" — and any future query or report that
-- orders or filters on sent_at silently sees nothing.
--
-- Additive and idempotent. Safe to run twice. Existing rows keep sent_at null; the
-- authoritative send timestamp for anything already sent is outreach_sends.sent_at.

alter table public.outreach_queue
  add column if not exists sent_at timestamptz;

-- Batch senders and reports read the queue by status and recency.
create index if not exists outreach_queue_status_created_idx
  on public.outreach_queue (status, created_at desc);

create index if not exists outreach_queue_sent_at_idx
  on public.outreach_queue (sent_at desc);
