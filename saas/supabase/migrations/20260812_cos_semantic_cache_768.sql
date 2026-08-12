-- saas/supabase/migrations/20260812_cos_semantic_cache_768.sql
--
-- Resizes cos_knowledge_records.embedding and the cos_match_knowledge RPC from
-- vector(1536) (the OpenAI embedding size, assumed before a real embedding model was
-- wired in) to vector(768) — the actual output size of nomic-embed-text, the model
-- COS's semantic cache now generates embeddings with on the local RunPod reasoner.
--
-- Safe as a straight ALTER: cos_knowledge_records had zero rows at the time of this
-- migration (grep across the whole repo on Aug 12 found no writer had ever run — the
-- EmbeddingGenerator dependency was never implemented until lib/ai/cos/
-- localEmbeddings.ts). If this ever runs against a table that already has rows, the
-- ALTER will fail loudly rather than silently truncating real vectors — which is the
-- correct failure mode; those rows would need re-embedding, not resizing in place.

alter table public.cos_knowledge_records
  alter column embedding type vector(768);

drop function if exists public.cos_match_knowledge(vector(1536), text, integer);

create or replace function public.cos_match_knowledge(
  query_embedding vector(768),
  match_task_id text,
  match_count integer default 1
)
returns table(response_data jsonb, similarity double precision)
language sql stable
as $$
  select k.response_data,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.cos_knowledge_records k
  where k.task_id = match_task_id
  order by k.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
