// saas/tests/cosLearnedCorpusVectorIndex.node.test.ts
//
// Owner direction 2026-09-29: COS must use its embedded continuous-learning corpus when answering. The corpus
// (116k embedded rows) had no vector index and its search function sorted by distance plus three tie-break
// columns, a shape no vector index can serve, so every question scanned every row inside a 900 ms budget.
// This pins the index and the index-servable search shape. Verified locally against pgvector: the same
// top-40 as the exact scan, ~30x faster on 30k rows.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const migration = read('../supabase/migrations/20260929233000_cos_learned_corpus_vector_index.sql')

test('the learned corpus gets a cosine vector index matching the real column type', () => {
  assert.match(migration, /using ivfflat \(%s vector_cosine_ops\) with \(lists = %s\)/)
  assert.match(migration, /v_expr := case when v_type = 'vector\(768\)' then 'embedding' else '\(embedding::vector\(768\)\)' end/)
  assert.match(migration, /am\.amname in \('ivfflat', 'hnsw'\)/, 're-running must not build a second index')
  assert.match(migration, /set statement_timeout = 0;/)
})

test('the nearest-neighbour step is a pure distance ORDER BY + LIMIT, then the original ordering', () => {
  assert.match(migration, /order by %1\$s <=> query_embedding\s+limit greatest\(1, least\(match_count, 64\)\)/)
  assert.match(migration, /order by nearest\.distance,\s+nearest\.confidence desc,\s+nearest\.observed_at desc,\s+nearest\.source_uri asc;/)
  assert.match(migration, /set ivfflat\.probes = 12/)
})

test('filters and signature are unchanged, so the application call needs no change', () => {
  assert.match(migration, /query_embedding vector,\s+match_count integer default 24,\s+min_similarity double precision default 0\.45,\s+match_embedding_model text default null/)
  assert.match(migration, /match_embedding_model is null or learning\.embedding_model = match_embedding_model/)
  assert.match(migration, /not ilike 'relevance_rejected:%%'/)
  assert.match(migration, /where 1 - nearest\.distance >= greatest\(0, least\(1, min_similarity\)\)/)
  const caller = read('../lib/ai/cos/learnedCorpusSemantic.ts')
  assert.match(caller, /db\.rpc\('cos_match_continuous_learning', \{\s+query_embedding: vector,\s+match_count:[^\n]+\n\s+min_similarity:[^\n]+\n\s+match_embedding_model: model,/)
})
