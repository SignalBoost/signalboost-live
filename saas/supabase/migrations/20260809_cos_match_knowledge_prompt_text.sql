-- Semantic reuse needs the original prompt as well as the cached response so COS
-- can reason about/reuse the match without losing its provenance.
drop function if exists public.cos_match_knowledge(vector, text, integer);

create function public.cos_match_knowledge(
  query_embedding vector(1536),
  match_task_id text,
  match_count integer default 1
)
returns table(prompt_text text, response_data jsonb, similarity double precision)
language sql stable
as $$
  select k.prompt_text,
         k.response_data,
         1 - (k.embedding <=> query_embedding) as similarity
  from public.cos_knowledge_records k
  where k.task_id = match_task_id
  order by k.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;
