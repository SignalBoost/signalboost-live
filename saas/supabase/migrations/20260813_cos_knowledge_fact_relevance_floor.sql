-- Prevent weak cross-domain semantic matches from entering COS answer context.
-- The caller may request a higher minimum, but never lower than this safety floor.
-- This is intentionally conservative until query/domain anchoring is enforced in the app layer.

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
    and 1 - (facts.embedding <=> query_embedding) >= greatest(0.68, greatest(0, least(1, min_similarity)))
  order by facts.embedding <=> query_embedding,
           facts.confidence desc,
           facts.updated_at desc,
           facts.subject asc
  limit greatest(1, least(match_count, 50));
$$;
