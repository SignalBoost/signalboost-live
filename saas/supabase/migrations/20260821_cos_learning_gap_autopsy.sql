--
-- FAILURE MEMORY FOR LEARNING GAPS.
--
-- markQueuedReasoningGaps() currently writes status='failed' and nothing else, and the next cycle
-- re-selects ['pending','failed']. So a gap that has failed twelve times is treated exactly like one
-- failing its first: same study slot, same acquisition query, same outcome, forever. The failure
-- reason is computed and then discarded.
--
-- These columns give a gap a memory of its own failures, so the cycle can tell "this missed twice"
-- from "this has never been acquirable".
--
-- WHY RETIRE RATHER THAN DELETE: a retired gap is still capability signal. "COS repeatedly cannot
-- answer questions about X and no reachable source covers it" is a curriculum finding worth telling
-- a buyer about. Deleting would throw away the finding along with the retry.

alter table public.cos_learning_gaps
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0);

-- [{ reason, at }] — one entry per failed cycle, newest last, bounded by the writer.
alter table public.cos_learning_gaps
  add column if not exists failure_attempts jsonb not null default '[]'::jsonb;

-- Set only when a gap leaves the study window. Null means still in play.
alter table public.cos_learning_gaps
  add column if not exists autopsy_verdict text
    check (autopsy_verdict is null or autopsy_verdict in ('retry', 'unacquirable', 'malformed'));
alter table public.cos_learning_gaps
  add column if not exists autopsy_rationale text;
alter table public.cos_learning_gaps
  add column if not exists autopsy_at timestamptz;

-- 'retired' is terminal and non-retryable, like 'unstudyable', but reached by EVIDENCE (repeated
-- failed acquisition) rather than by shape. Kept separate so the two findings stay distinguishable:
-- "we never could get material for this" and "this was never a question" call for different fixes.
alter table public.cos_learning_gaps
  drop constraint if exists cos_learning_gaps_status_check;
alter table public.cos_learning_gaps
  add constraint cos_learning_gaps_status_check
  check (status in ('pending', 'learning', 'resolved', 'failed', 'unstudyable', 'retired'));

-- The selection query filters on status; retired gaps must drop out of it cheaply.
create index if not exists cos_learning_gaps_autopsy_idx
  on public.cos_learning_gaps(status, attempt_count desc)
  where autopsy_at is not null;

comment on column public.cos_learning_gaps.failure_attempts is
  'Per-cycle failure reasons. The memory that turns an infinite retry into a decidable question.';
comment on column public.cos_learning_gaps.autopsy_verdict is
  'retry | unacquirable | malformed. Terminal verdicts retire the gap from the study window but never delete it — the gap remains capability signal.';
