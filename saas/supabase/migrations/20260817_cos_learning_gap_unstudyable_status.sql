--
-- A queued learning gap whose subject is not a study domain (chat fragments such as
-- "worse president times" or "show components relationships") must leave the study window instead
-- of being re-selected every cycle and sent to source adapters as a research query.
-- 'unstudyable' is a terminal, non-retryable state: the gap still exists as capability signal,
-- it is simply never acquired against.

alter table public.cos_learning_gaps
  drop constraint if exists cos_learning_gaps_status_check;

alter table public.cos_learning_gaps
  add constraint cos_learning_gaps_status_check
  check (status in ('pending', 'learning', 'resolved', 'failed', 'unstudyable'));
