-- saas/supabase/migrations/20260802_supervisor_assessment_ledger.sql
--
-- WHAT DID YOU CONCLUDE AT 03:00, AND ON WHAT EVIDENCE?
--
-- Until now the Supervisor could not answer that. Every conclusion was computed when someone
-- opened the console and thrown away when they closed it. The console could show its
-- reasoning in the present tense and nothing else — no history, no replay, no way for an
-- auditor or an incident review to check what the system believed at the moment it mattered.
--
-- That gap had a visible cost on the page: reproducibility read "Partial — observation inputs
-- are not yet retained". The modules are pure, so the same inputs always give the same
-- conclusion; what was missing was the inputs. This table is them.
--
-- THE INPUTS ARE THE POINT. `inputs` is not diagnostic colour — it is the record that makes
-- the conclusion checkable. Feed it back through the same modules and you must get the same
-- assessment; if you do not, either the modules changed (and `module_version` says so) or
-- something is wrong, and both of those are worth finding out. `input_digest` is the short
-- fingerprint of that payload, so two people can tell in one glance whether they are looking
-- at the same evidence.
--
-- ONE ROW PER CHANGE OF INPUTS, NOT ONE PER PAGE VIEW. The writer compares the incoming
-- digest with the newest stored row and skips an identical one. A console that recorded an
-- assessment every time a tab was opened would fill this table with traffic rather than
-- history, and the first question of any review — "when did this change?" — would become
-- unanswerable in its own audit trail.
--
-- APPEND-ONLY BY INTENT. There is no update path in the writer. An assessment that could be
-- edited after the fact is not evidence, and the whole product rests on that distinction.

create table if not exists supervisor_assessment_ledger (
  id                  uuid primary key default gen_random_uuid(),
  recorded_at         timestamptz not null default now(),

  /** Which environment this conclusion covers. One ledger, many observed scopes. */
  environment         text        not null default 'production',

  -- ── The conclusion, denormalised so the common queries need no JSON parsing ──
  /** operational | service_degraded | outage. */
  operational_state   text        not null,
  /** Whether the business was affected, stated separately from the state by design. */
  impact_affected     boolean     not null default false,
  /** 0-100. Confidence in the EVIDENCE, never a statement about the platform. */
  confidence          integer     not null,
  /** Whether this conclusion woke somebody. Only a verified outage ever does. */
  page_on_call        boolean     not null default false,
  /** Contradictions the assessment found between its own outputs. Above zero means the
      console was wrong about something at this moment, and that is worth keeping. */
  contradictions      integer     not null default 0,

  -- ── The justification and the evidence, in full ─────────────────────────────
  /** Basis lines, confidence ledger, forecast set, integrity, diagnostic summary. */
  assessment          jsonb       not null,
  /** The exact inputs the conclusion was derived from. This is what makes replay possible. */
  inputs              jsonb       not null,
  /** Short fingerprint of `inputs`. Same evidence, same fingerprint. */
  input_digest        text        not null,
  /** Which build of the reasoning modules produced it — a conclusion is only reproducible
      against the code that made it, and pretending otherwise would be the same overclaim
      this table exists to remove. */
  module_version      text        not null,

  constraint supervisor_assessment_confidence check (confidence >= 0 and confidence <= 100),
  constraint supervisor_assessment_state check (operational_state in ('operational', 'service_degraded', 'outage'))
);

-- Every query this serves is "the most recent, for this environment": the newest conclusion,
-- the streak of unchanged ones, the window an auditor asks about.
create index if not exists supervisor_assessment_ledger_recent
  on supervisor_assessment_ledger (environment, recorded_at desc);

-- "When did it last change?" and "has this fingerprint been seen before?" are the two lookups
-- that are not time-ordered.
create index if not exists supervisor_assessment_ledger_digest
  on supervisor_assessment_ledger (environment, input_digest);

comment on table supervisor_assessment_ledger is
  'Append-only record of every operational conclusion the Supervisor reached, with the exact inputs behind it. Makes an assessment reproducible after the fact rather than only in principle.';
comment on column supervisor_assessment_ledger.inputs is
  'The evidence the conclusion was derived from. Replaying it through the same module version must produce the same assessment.';
comment on column supervisor_assessment_ledger.input_digest is
  'Short fingerprint of the inputs. A new row is written only when this differs from the newest stored row, so the ledger records changes rather than page views.';
comment on column supervisor_assessment_ledger.module_version is
  'Build of the reasoning modules. A conclusion is reproducible against the code that produced it, not against whatever is deployed today.';
comment on column supervisor_assessment_ledger.contradictions is
  'Contradictions the assessment found between its own outputs at this moment. Deliberately retained: a console that quietly forgets when it disagreed with itself cannot be audited.';

-- NOTE ON RETENTION. Nothing here is pruned automatically, on purpose — an audit record that
-- deletes itself on a schedule nobody chose is worse than one that grows. A buyer sets their
-- own retention against their compliance calendar; the shape to expect is a scheduled delete
-- of rows older than their window, keeping every row where contradictions > 0 or
-- operational_state <> 'operational'.
