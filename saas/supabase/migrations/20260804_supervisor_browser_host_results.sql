-- saas/supabase/migrations/20260804_supervisor_browser_host_results.sql
--
-- The browser channel needs somewhere to put two things the ledger never held: WHICH
-- package was dispatched, and WHAT the host reported back.
--
-- These are columns on supervisor_dispatch_ledger rather than a new table, on purpose. A
-- browser dispatch is not a different kind of event from an api or manual dispatch — it
-- is the same event executed elsewhere — and splitting it into a parallel table would
-- mean two places to look when asking "what did the supervisor do about this incident",
-- which is the question the ledger exists to answer.
--
-- Every statement is idempotent and additive. No begin/commit wrapper: this repo has been
-- bitten before by SQL run through the Hub Console's hub_exec_sql, which executes via
-- PL/pgSQL EXECUTE and rejects transaction-control commands.

alter table public.supervisor_dispatch_ledger
  add column if not exists package_fingerprint text;

alter table public.supervisor_dispatch_ledger
  add column if not exists host text;

-- The full browser-host-result-v1 document, verbatim. Stored whole rather than shredded
-- into columns because it is EVIDENCE: an incident review needs the record the host
-- actually produced, not this schema's interpretation of it at the time it was written.
alter table public.supervisor_dispatch_ledger
  add column if not exists result jsonb;

alter table public.supervisor_dispatch_ledger
  add column if not exists result_received_at timestamptz;

-- Finding a dispatch by fingerprint is how the ingest endpoint proves an incoming result
-- belongs to a package this system actually sent.
create index if not exists supervisor_dispatch_ledger_fingerprint_idx
  on public.supervisor_dispatch_ledger (package_fingerprint)
  where package_fingerprint is not null;

notify pgrst, 'reload schema';
