import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = async (path: string) => readFile(new URL(path, import.meta.url), 'utf8')

test('persistent COS runtime exposes durable knowledge graph beside semantic knowledge', async () => {
  const runtime = await read('../lib/cos-core/storage/runtime.ts')
  assert.match(runtime, /KnowledgeGraph/)
  assert.match(runtime, /knowledgeGraph: new KnowledgeGraph\(stores\.knowledge\)/)
})

test('platform runtime provides automatic cached COS context summaries', async () => {
  const runtime = await read('../lib/cos/platformRuntime.ts')
  assert.match(runtime, /createPlatformMemoryCompactor/)
  assert.match(runtime, /taskId: 'cos-context-summary'/)
  assert.match(runtime, /cacheValidator: validMemorySummary/)
  assert.match(runtime, /fallbackSnapshot/)
  assert.match(runtime, /compactMemory: options\.compactMemory \?\? createPlatformMemoryCompactor\(\)/)
})

test('COS AI port allows task-specific cache identity', async () => {
  const source = await read('../lib/cos/aiPort.ts')
  assert.match(source, /taskId\?: string/)
  assert.match(source, /taskId: input\.taskId \?\? 'cos-portable-text'/)
})

test('semantic knowledge RPC returns prompt provenance for reuse', async () => {
  const migration = await read('../supabase/migrations/20260809_cos_match_knowledge_prompt_text.sql')
  assert.match(migration, /returns table\(prompt_text text, response_data jsonb, similarity double precision\)/)
  assert.match(migration, /select k\.prompt_text/)
})
