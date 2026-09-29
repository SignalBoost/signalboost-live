-- saas/supabase/migrations/20260929233000_cos_learned_corpus_vector_index.sql
--
-- Make COS's embedded learning corpus searchable inside the time COS gives it.
--
-- Owner direction 2026-09-29: "I want COS to use this continuing learning material when answering
-- questions, the embedded dataset is there for COS to use and it is not." The learning page reports
-- 126,191 retained rows, 116,174 embedded, and only 11% of the learned evidence handed to COS cited.
--
-- What the repository shows:
--   1. Every other COS vector table has an ANN index (knowledge facts, semantic cache, creative memory);
--      cos_continuous_learning - by far the largest, 116k 768-d vectors - has none. Each question
--      therefore computes the distance to every embedded row.
--   2. cos_match_continuous_learning orders by distance AND confidence/observed_at/source_uri. An
--      index can only serve ORDER BY distance alone, so even an index would never have been used.
--   3. COS gives this lookup (question embedding + search) 900 ms (COS_KNOWLEDGE_FACT_RETRIEVAL_BUDGET_MS)
--      and switches to keyword matching over subject/summary when it is late.
--
-- This migration adds an IVFFlat cosine index (builds in about a minute and within normal memory; HNSW
-- over 116k rows can need far more build memory and time than the query bridge allows) and rewrites
-- the function so the nearest-neighbour step is a pure distance ORDER BY the index can serve. The
-- function signature, returned columns, filters (active embedding model, relevance-rejected rows
-- excluded, min_similarity) and final ordering are unchanged, so no application code changes.
--
-- Safe to re-run. It reads the column's real type (vector or vector(768)) and uses the matching
-- expression, skips the build if an equivalent index already exists, and runs in one transaction:
-- if anything fails, nothing changes.

set statement_timeout = 0;

do $migration$
declare
  v_type text;
  v_expr text;
  v_rows bigint;
  v_lists integer;
  v_existing text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_type
  from pg_attribute a
  where a.attrelid = 'public.cos_continuous_learning'::regclass
    and a.attname = 'embedding'
    and not a.attisdropped;
  if v_type is null then
    raise exception 'cos_continuous_learning.embedding does not exist';
  end if;
  -- A typed vector(768) column is indexed directly; an untyped vector column needs the fixed-dimension cast.
  v_expr := case when v_type = 'vector(768)' then 'embedding' else '(embedding::vector(768))' end;

  select pg_get_indexdef(i.indexrelid) into v_existing
  from pg_index i
  join pg_class c on c.oid = i.indexrelid
  join pg_am am on am.oid = c.relam
  where i.indrelid = 'public.cos_continuous_learning'::regclass
    and am.amname in ('ivfflat', 'hnsw')
    and pg_get_indexdef(i.indexrelid) ilike '%vector_cosine_ops%'
    and (
      (v_expr = 'embedding' and pg_get_indexdef(i.indexrelid) ilike '%(embedding vector_cosine_ops)%')
      or (v_expr <> 'embedding' and pg_get_indexdef(i.indexrelid) ilike '%(embedding)::vector(768)%')
    )
  limit 1;

  if v_existing is null then
    select count(*) into v_rows from public.cos_continuous_learning where embedding is not null;
    -- pgvector guidance: lists ~ rows / 1000 up to 1M rows; keep a floor for a growing corpus.
    v_lists := greatest(100, least(1000, (v_rows / 1000)::integer));
    perform set_config('maintenance_work_mem', '256MB', true);
    execute format(
      'create index cos_continuous_learning_embedding_ivfflat_idx on public.cos_continuous_learning using ivfflat (%s vector_cosine_ops) with (lists = %s)',
      v_expr, v_lists
    );
    raise notice 'cos_continuous_learning: built ivfflat cosine index over % embedded rows (lists=%)', v_rows, v_lists;
  else
    raise notice 'cos_continuous_learning: matching vector index already present: %', v_existing;
  end if;

  execute format($function$
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
    language sql
    stable
    set ivfflat.probes = 12
    set hnsw.ef_search = 200
    as $body$
      with nearest as (
        -- Pure distance order + LIMIT: the only shape a vector index can serve.
        select
          learning.content_hash,
          learning.subject,
          learning.summary,
          learning.facts,
          learning.confidence,
          learning.source_kind,
          learning.source_uri,
          learning.observed_at,
          %1$s <=> query_embedding as distance
        from public.cos_continuous_learning as learning
        where learning.embedding is not null
          and (match_embedding_model is null or learning.embedding_model = match_embedding_model)
          and coalesce(learning.fact_extraction_error, '') not ilike 'relevance_rejected:%%'
        order by %1$s <=> query_embedding
        limit greatest(1, least(match_count, 64))
      )
      select
        nearest.content_hash,
        nearest.subject,
        nearest.summary,
        nearest.facts,
        nearest.confidence,
        nearest.source_kind,
        nearest.source_uri,
        nearest.observed_at,
        1 - nearest.distance as similarity
      from nearest
      where 1 - nearest.distance >= greatest(0, least(1, min_similarity))
      order by nearest.distance,
               nearest.confidence desc,
               nearest.observed_at desc,
               nearest.source_uri asc;
    $body$
  $function$, replace(v_expr, 'embedding', 'learning.embedding'));
end
$migration$;
