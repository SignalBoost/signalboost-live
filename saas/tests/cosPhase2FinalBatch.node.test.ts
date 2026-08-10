import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = path.resolve(process.cwd())
const read = (relative: string) => fs.readFileSync(path.join(root, relative), 'utf8')

test('marketing director uses COS gateway instead of direct Anthropic client', () => {
  const source = read('marketing-sales-host/director.ts')
  assert.match(source, /createPlatformAiPort/)
  assert.doesNotMatch(source, /@anthropic-ai\/sdk/)
  assert.doesNotMatch(source, /new Anthropic/)
})

test('audit executive summary uses COS gateway instead of direct Anthropic client', () => {
  const source = read('app/api/hub/audit/executive-summary/route.ts')
  assert.match(source, /createPlatformAiPort/)
  assert.doesNotMatch(source, /@anthropic-ai\/sdk/)
  assert.doesNotMatch(source, /api\.anthropic\.com/)
})

test('persistent COS runtime composes durable cache, memory, knowledge, learning and ROI', () => {
  const source = read('lib/cos-core/storage/runtime.ts')
  for (const token of ['SupabaseExactCacheStore', 'withContextSummaryCache', 'KnowledgeGraph', 'LearningEngine', 'roiMetrics']) {
    assert.match(source, new RegExp(token))
  }
  const migration = read('supabase/migrations/20260810_cos_exact_cache.sql')
  assert.match(migration, /cos_exact_cache/)
  assert.match(migration, /enable row level security/i)
})
