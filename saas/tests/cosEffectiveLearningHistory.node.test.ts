import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const continuity = readFileSync(new URL('../lib/ai/cos/learningContinuityReport.ts', import.meta.url), 'utf8')
const dynamic = readFileSync(new URL('../lib/cos-core/layers/learning/dynamicGaps.ts', import.meta.url), 'utf8')
const semantic = readFileSync(new URL('../lib/ai/cos/learnedCorpusSemantic.ts', import.meta.url), 'utf8')
const migration = readFileSync(new URL('../supabase/migrations/20260914195900_owner_directed_historical_duplicate_quarantine.sql', import.meta.url), 'utf8')

const rejectionFilter = /fact_extraction_error\.is\.null,fact_extraction_error\.not\.ilike\.relevance_rejected:%/

test('decision-making reads exclude relevance-rejected historical corpus rows', () => {
  assert.match(continuity, rejectionFilter)
  assert.match(continuity, /\.or\(EFFECTIVE_CORPUS_FILTER\)/)
  assert.match(dynamic, rejectionFilter)
  assert.ok((dynamic.match(/\.or\(EFFECTIVE_CORPUS_FILTER\)/g) || []).length >= 2)
  assert.match(semantic, /coalesce\(learning\.fact_extraction_error, ''\) not ilike 'relevance_rejected:%'/)
})

test('historical duplicate quarantine is reversible and preserves source evidence', () => {
  assert.match(migration, /create table if not exists public\.cos_continuous_learning_duplicate_quarantine/)
  assert.match(migration, /canonical_content_hash text not null/)
  assert.match(migration, /previous_fact_extraction_status text/)
  assert.match(migration, /previous_fact_extraction_error text/)
  assert.match(migration, /previous_fact_extraction_attempts integer/)
  assert.match(migration, /relevance_rejected: duplicate_owner_directed_material canonical=/)
  assert.doesNotMatch(migration, /delete from public\.cos_continuous_learning/i)
  assert.doesNotMatch(migration, /set\s+embedding\s*=\s*null/i)
})

test('quarantine keeps one canonical material copy and stops duplicate promotion retries', () => {
  assert.match(migration, /row_number\(\) over/)
  assert.match(migration, /first_value\(d\.content_hash\) over/)
  assert.match(migration, /where r\.copies > 1 and r\.rn > 1/)
  assert.match(migration, /fact_extraction_status='completed'/)
  assert.match(migration, /on conflict \(content_hash\) do nothing/)
})
