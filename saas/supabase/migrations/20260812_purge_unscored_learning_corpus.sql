-- saas/supabase/migrations/20260812_purge_unscored_learning_corpus.sql
--
-- Every row currently in cos_continuous_learning was admitted by the old
-- ContinuousLearningCycle.toCandidate, which assigned a CONSTANT confidence of 0.8 and stored a
-- single pseudo-fact with predicate 'source_summary' whose object was the first 1,200 characters
-- of whatever the source returned. Nothing scored the document against the question it was meant
-- to answer, so 0.8 always cleared the 0.72 admission threshold and off-topic material was stored
-- as knowledge: a European labour-market paper and a contract-law passage filed under
-- "multi-tenant saas", an Agentic-RAG video promo filed under "PostgreSQL database performance".
--
-- cosFirstAnswer.retrieveInternalContext reads this table directly (ilike over subject/summary) and
-- feeds what it finds to the reasoner as evidence, so these rows are not inert — they are actively
-- polluting the context of every answer whose terms happen to overlap.
--
-- The fixed cycle emits predicate 'source_excerpt' and a measured confidence, so targeting the old
-- predicate removes exactly the unscored rows and nothing produced after the fix. Re-acquisition is
-- cheap: the source adapters are zero-LLM public-data clients, and the study run can simply be
-- triggered again once the relevance gate is deployed.

delete from public.cos_continuous_learning
where facts @> '[{"predicate": "source_summary"}]'::jsonb;

-- Learning gaps that were marked resolved by those rows must go back to pending, or the curriculum
-- will believe the questions are already answered and never re-study them.
update public.cos_learning_gaps
set status = 'pending', resolved_at = null
where status = 'resolved';
