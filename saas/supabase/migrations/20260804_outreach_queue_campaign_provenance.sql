-- saas/supabase/migrations/20260804_outreach_queue_campaign_provenance.sql
--
-- WHICH CAMPAIGN PUT THIS CONTACT IN MY QUEUE?
--
-- Until now that question had no direct answer. A queue row recorded what was drafted and
-- to whom, and nothing about the run that produced it. Answering it meant reading a job's
-- `results` array and matching business_url hosts back against the queue — a
-- reconstruction, not a fact. It misses any row whose URL was stored in a different shape,
-- and it wrongly claims any row that happens to share a domain with a candidate.
--
-- That was discovered the hard way. A press brief was misrouted into the sales prospecting
-- pipeline and the first question was "what did it put in the queue" — which took four
-- queries and a host-matching heuristic to answer. The answer turned out to be nothing, so
-- the reconstruction cost only time. A job that HAD created rows would have left the
-- operator deciding whether to trust a fuzzy match before deleting customer records.
--
-- ONE COLUMN MAKES THE CAMPAIGN THE UNIT OF UNDO. With it, "show me everything that run
-- created" and "archive everything that run created" are exact, and a misrouted campaign
-- is reversible as the single mistake it was rather than row by row.
--
-- NULL IS A REAL AND CORRECT VALUE. Drafts are also created one at a time by a person, and
-- those genuinely have no job behind them. Backfilling existing rows with a guessed job id
-- would turn a known gap into fabricated provenance, which is worse than the gap: an
-- auditor can work with "unknown", and cannot work with "wrong".
--
-- NO FOREIGN KEY, DELIBERATELY. A queue row must survive its job record being pruned — the
-- contact and what was sent to them is the durable fact, the run is the metadata. A cascade
-- here would let a retention sweep on jobs delete outreach history.
--
-- Every statement is idempotent and additive. No begin/commit wrapper: this repo has been
-- bitten before by SQL run through the Hub Console's hub_exec_sql, which executes via
-- PL/pgSQL EXECUTE and rejects transaction-control commands.

alter table public.outreach_queue
  add column if not exists campaign_job_id uuid;

-- The two queries this exists for: "everything that run created", newest first.
create index if not exists outreach_queue_campaign_job
  on public.outreach_queue (campaign_job_id, created_at desc)
  where campaign_job_id is not null;

comment on column public.outreach_queue.campaign_job_id is
  'The prospect_campaign_jobs run that created this draft, or null when a person created it directly. Deliberately not a foreign key: a queue row must outlive its job record. Never backfilled by inference — an unknown origin stays null rather than becoming a guess.';
