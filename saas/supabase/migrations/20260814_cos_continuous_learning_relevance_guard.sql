-- Keep semantic learned-corpus retrieval aligned with COS governance quarantine.
-- Rows marked relevance_rejected remain stored for audit, but they cannot participate in
-- pgvector retrieval and do not need embeddings.

create or replace function public.cos_match_continuous_learning(
  query_embedding vector,
  match_count integer default 24,
  min_similarity double precision default 0.45
)
returns table(
  content_hash text,
  subject text,
  summary text,
  facts jsonb,
  confidence double precision,
  source_kind text,
  source_uri text,
  observed_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    learning.content_hash,
    learning.subject,
    learning.summary,
    learning.facts,
    learning.confidence,
    learning.source_kind,
    learning.source_uri,
    learning.observed_at,
    1 - (learning.embedding <=> query_embedding) as similarity
  from public.cos_continuous_learning as learning
  where learning.embedding is not null
    and coalesce(learning.fact_extraction_error, '') not ilike 'relevance_rejected:%'
    and 1 - (learning.embedding <=> query_embedding) >= greatest(0, least(1, min_similarity))
  order by learning.embedding <=> query_embedding,
           learning.confidence desc,
           learning.observed_at desc,
           learning.source_uri asc
  limit greatest(1, least(match_count, 64));
$$;
