-- Semantic retrieval for structured COS knowledge facts.
-- Reuses the same 768-dimensional nomic-embed-text representation as the semantic answer cache.
-- Existing facts remain valid with a NULL embedding and are backfilled incrementally by COS.

alter table public.cos_knowledge_facts
  add column if not exists embedding vector(768);

create index if not exists cos_knowledge_facts_embedding_hnsw_idx
  on public.cos_knowledge_facts
  using hnsw (embedding vector_cosine_ops);

create or replace function public.cos_match_knowledge_facts(
  query_embedding vector(768),
  match_count integer default 16,
  min_similarity double precision default 0.55
)
returns table (
  id text,
  task_id text,
  subject text,
  predicate text,
  object text,
  confidence double precision,
  source text,
  updated_at timestamptz,
  similarity double precision
)
language sql stable
as $$
  select
    facts.id,
    facts.task_id,
    facts.subject,
    facts.predicate,
    facts.object,
    facts.confidence,
    facts.source,
    facts.updated_at,
    1 - (facts.embedding <=> query_embedding) as similarity
  from public.cos_knowledge_facts as facts
  where facts.embedding is not null
    and 1 - (facts.embedding <=> query_embedding) >= greatest(0, least(1, min_similarity))
  order by facts.embedding <=> query_embedding,
           facts.confidence desc,
           facts.updated_at desc,
           facts.subject asc
  limit greatest(1, least(match_count, 50));
$$;
