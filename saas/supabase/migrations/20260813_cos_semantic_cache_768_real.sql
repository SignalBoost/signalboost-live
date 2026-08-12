-- saas/supabase/migrations/20260813_cos_semantic_cache_768_real.sql
--
-- THE MIGRATION THAT WAS SUPPOSED TO BE 20260812_cos_semantic_cache_768.sql. That file was
-- delivered with the wrong content — it contains the assistant_messages provenance migration,
-- header comment and all — so running it altered a different table and left
-- cos_knowledge_records.embedding at vector(1536). nomic-embed-text emits 768-dimension vectors,
-- so every semantic-cache write since the feature shipped has been rejected with
-- "expected 1536 dimensions, not 768", swallowed, and the cache has never held a single row.
--
-- The table is empty (verified before writing this), so retyping the column is lossless.

alter table public.cos_knowledge_records
  alter column embedding type vector(768) using embedding::vector(768);

-- The match RPC must agree with the column's dimension, or lookups fail the same way writes did.
drop function if exists public.cos_match_knowledge(vector, text, integer);

create or replace function public.cos_match_knowledge(
  query_embedding vector(768),
  match_task_id text,
  match_count integer default 1
)
returns table (
  prompt_text text,
  response_data jsonb,
  similarity double precision
)
language sql stable
as $$
  select
    records.prompt_text,
    records.response_data,
    1 - (records.embedding <=> query_embedding) as similarity
  from public.cos_knowledge_records as records
  where records.task_id = match_task_id
  order by records.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

-- Cosine index for the lookup path. HNSW so it stays correct as the cache grows; at today's row
-- counts Postgres may not even use it, which is fine — correctness first, speed when it matters.
create index if not exists cos_knowledge_records_embedding_hnsw_idx
  on public.cos_knowledge_records
  using hnsw (embedding vector_cosine_ops);
