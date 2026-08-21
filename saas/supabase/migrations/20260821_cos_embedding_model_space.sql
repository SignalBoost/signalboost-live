-- COS vector-space identity.
--
-- ROOT CAUSE (2026-08-21): Production moved from nomic-embed-text to
-- BAAI/bge-base-en-v1.5. Both emit 768 dimensions, but their coordinate spaces are unrelated.
-- Existing rows had no model identity, so BGE query vectors were compared against historical Nomic
-- vectors. This passed every dimension/health check while semantic retrieval became unreliable.
--
-- Never infer vector compatibility from dimension alone. Existing vectors are explicitly legacy;
-- bounded application backfill regenerates durable fact/corpus vectors with the active model.

alter table public.cos_knowledge_records
  add column if not exists embedding_model text;

alter table public.cos_knowledge_facts
  add column if not exists embedding_model text;

alter table public.cos_continuous_learning
  add column if not exists embedding_model text;

update public.cos_knowledge_records
set embedding_model = 'legacy:unversioned'
where embedding is not null and coalesce(embedding_model, '') = '';

update public.cos_knowledge_facts
set embedding_model = 'legacy:unversioned'
where embedding is not null and coalesce(embedding_model, '') = '';

update public.cos_continuous_learning
set embedding_model = 'legacy:unversioned'
where embedding is not null and coalesce(embedding_model, '') = '';

create index if not exists cos_knowledge_records_embedding_model_idx
  on public.cos_knowledge_records (embedding_model);
create index if not exists cos_knowledge_facts_embedding_model_idx
  on public.cos_knowledge_facts (embedding_model);
create index if not exists cos_continuous_learning_embedding_model_idx
  on public.cos_continuous_learning (embedding_model);

-- Replace the old 3-argument signatures so PostgREST has one unambiguous callable RPC. The new
-- model argument defaults to NULL for deployment-order compatibility with old application code;
-- current code always supplies it and therefore never mixes vector spaces.
drop function if exists public.cos_match_knowledge(vector, text, integer);

create or replace function public.cos_match_knowledge(
  query_embedding vector(768),
  match_task_id text,
  match_count integer default 1,
  match_embedding_model text default null
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
    and records.embedding is not null
    and (match_embedding_model is null or records.embedding_model = match_embedding_model)
  order by records.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

drop function if exists public.cos_match_knowledge_facts(vector, integer, double precision);

create or replace function public.cos_match_knowledge_facts(
  query_embedding vector(768),
  match_count integer default 16,
  min_similarity double precision default 0.55,
  match_embedding_model text default null
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
    and (match_embedding_model is null or facts.embedding_model = match_embedding_model)
    and 1 - (facts.embedding <=> query_embedding) >= greatest(0.68, greatest(0, least(1, min_similarity)))
  order by facts.embedding <=> query_embedding,
           facts.confidence desc,
           facts.updated_at desc,
           facts.subject asc
  limit greatest(1, least(match_count, 50));
$$;

drop function if exists public.cos_match_continuous_learning(vector, integer, double precision);

create or replace function public.cos_match_continuous_learning(
  query_embedding vector,
  match_count integer default 24,
  min_similarity double precision default 0.45,
  match_embedding_model text default null
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
language sql stable
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
    and (match_embedding_model is null or learning.embedding_model = match_embedding_model)
    and coalesce(learning.fact_extraction_error, '') not ilike 'relevance_rejected:%'
    and 1 - (learning.embedding <=> query_embedding) >= greatest(0, least(1, min_similarity))
  order by learning.embedding <=> query_embedding,
           learning.confidence desc,
           learning.observed_at desc,
           learning.source_uri asc
  limit greatest(1, least(match_count, 64));
$$;
