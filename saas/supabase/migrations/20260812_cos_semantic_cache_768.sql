-- saas/supabase/migrations/20260812_assistant_messages_provenance.sql
--
-- One nullable jsonb column: the REAL execution provenance of each assistant turn,
-- stored with the turn it describes. This is the missing half of the Aug 12
-- provenance fix: the object was computed on every COS-first answer (responseSource,
-- reasonerLabel, knowledgeFactsUsed, learnedItemsUsed, userMemoriesUsed,
-- similarityScore) and then discarded when the request ended — so "show me the
-- provenance for the answer you just gave" had nothing real to consult, and the only
-- honest reply possible was a refusal. With this column, the introspection guard in
-- support/route.ts answers from this stored record. Nullable by design: turns
-- predating this migration simply have none, and the guard says so rather than
-- inventing one.

alter table public.assistant_messages
  add column if not exists provenance jsonb;

-- Partial index: the introspection lookup is always "latest assistant turn in THIS
-- conversation that has provenance", so index exactly that access path and nothing
-- wider. Most rows (all user turns, all pre-migration turns) have NULL provenance
-- and stay out of the index entirely.
create index if not exists assistant_messages_provenance_lookup_idx
  on public.assistant_messages (conversation_id, created_at desc)
  where role = 'assistant' and provenance is not null;
