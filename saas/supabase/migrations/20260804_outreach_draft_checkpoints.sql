-- saas/supabase/migrations/20260804_outreach_draft_checkpoints.sql
--
-- WHAT DID THIS DRAFT SAY BEFORE WE REWROTE IT?
--
-- The draft refresh rewrites the body of pending outreach rows in place. It has always
-- returned the previous body in its report — and that report lives exactly as long as the
-- HTTP response does. Once the browser tab closed, the only copy of what a hundred drafts
-- used to say was gone. A refresh that produced worse copy could be described afterwards
-- and not undone, which is the difference between a system that repairs and one that
-- merely explains itself.
--
-- This table is where the pre-change values go, so guarded runs can put them back.
--
-- ONE ROW PER CHUNK, NOT PER RECORD. The unit of recovery in guarded bulk execution is the
-- chunk: if a chunk fails, the whole chunk is written back. Storing per record would let a
-- half-restored chunk exist, which is precisely the state the boundary exists to prevent.
-- `record_ids` is denormalised alongside the payload so "was this draft checkpointed?" can
-- be answered without unpacking JSON.
--
-- THIS IS NOT A ROLLBACK, AND THE NAMING KEEPS THAT HONEST. Writing a previous value back
-- is a COMPENSATING write, not an atomic restore: if a person edited a draft between the
-- capture and the write-back, restoring the old body overwrites their newer one, and this
-- system cannot see edits it did not make. What the checkpoint buys is a bounded blast
-- radius and the exact ids — never a guarantee that time was reversed.
--
-- Every statement is idempotent and additive. No begin/commit wrapper: this repo has been
-- bitten before by SQL run through the Hub Console's hub_exec_sql, which executes via
-- PL/pgSQL EXECUTE and rejects transaction-control commands.

create table if not exists outreach_draft_checkpoints (
  checkpoint_key      text        primary key,
  created_at          timestamptz not null default now(),

  /** Groups every chunk of one refresh run, so an operator can undo a run, not just a chunk. */
  job_id              text        not null,

  /** outreach_queue ids covered by this checkpoint. Denormalised for lookup by draft. */
  record_ids          text[]      not null default '{}',

  /** The captured pre-change values, in the BulkRecordState shape the executor round-trips. */
  states              jsonb       not null,

  /** Set when these values were written back. A checkpoint is evidence either way, so a
      restored one is marked rather than deleted. */
  restored_at         timestamptz,

  /** Why the restore happened, or why it could not complete for some records. Populated on
      restore only. A restore without a stated cause is a guessing game for whoever reads
      this table during an incident review. */
  restore_detail      text
);

-- "What happened during that run?" is the question this serves, and it is always ordered.
create index if not exists outreach_draft_checkpoints_job
  on outreach_draft_checkpoints (job_id, created_at desc);

-- "Is there a checkpoint holding a previous version of THIS draft?" — the operator-facing
-- lookup, and the one that makes an undo offerable from a single row in the console.
create index if not exists outreach_draft_checkpoints_records
  on outreach_draft_checkpoints using gin (record_ids);

-- Sweeping unrestored checkpoints out of a retention window needs this ordering.
create index if not exists outreach_draft_checkpoints_recent
  on outreach_draft_checkpoints (created_at desc);

comment on table outreach_draft_checkpoints is
  'Pre-change draft bodies captured before a guarded refresh rewrites them. Enables a compensating write-back with a bounded blast radius; never an atomic rollback.';
comment on column outreach_draft_checkpoints.job_id is
  'Groups the chunks of one refresh run so an operator can undo the run rather than hunting chunk by chunk.';
comment on column outreach_draft_checkpoints.states is
  'Captured values in BulkRecordState shape. Written back verbatim on restore, which is why nothing derived or reformatted may be stored here.';
comment on column outreach_draft_checkpoints.restored_at is
  'Marked rather than deleted on restore. A checkpoint that erases itself once used cannot answer what was put back, or when.';

-- NOTE ON RETENTION. These rows contain outreach copy, not credentials or personal data
-- beyond what outreach_queue already holds — but they are the only remaining copy of text a
-- buyer may have decided to discard, so they should not live forever by default. Nothing is
-- pruned automatically here, deliberately: a buyer sets the window against their own
-- retention policy. The shape to expect is a scheduled delete of rows where restored_at is
-- not null, or created_at is older than their window, whichever their policy names first.
