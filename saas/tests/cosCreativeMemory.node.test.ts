import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const creative = readFileSync(join(ROOT, 'lib/ai/cos/creativeMemory.ts'), 'utf8')
const enterprise = readFileSync(join(ROOT, 'lib/ai/cos/cosFirstAnswerEnterprise.ts'), 'utf8')
const migration = readFileSync(join(ROOT, 'supabase/migrations/20260923193000_cos_creative_memory.sql'), 'utf8')

test('Creative Memory uses the existing active embedding model space and pgvector', () => {
  assert.match(creative, /generateLocalEmbedding/)
  assert.match(creative, /embeddingModelName\(\)/)
  assert.match(creative, /cos_match_creative_memory/)
  assert.match(migration, /embedding vector\(768\)/)
  assert.match(migration, /using hnsw \(embedding vector_cosine_ops\)/)
  assert.match(migration, /memory\.embedding_model = match_embedding_model/)
})

test('Creative Memory is audience-scoped and owner retrieval can see public plus owner patterns', () => {
  assert.match(migration, /audience in \('public','owner'\)/)
  assert.match(migration, /memory\.audience = 'public' or memory\.audience = match_audience/)
  assert.match(creative, /return privileged \? \['public', 'owner'\] : \['public'\]/)
})

test('raw model output cannot self-approve into Creative Memory', () => {
  assert.match(creative, /const status = input\.validated && Number\(input\.qualityScore\) >= 0\.65 \? 'approved' : 'quarantined'/)
  assert.match(migration, /status in \('approved','quarantined','retired'\)/)
  assert.match(migration, /where memory\.status = 'approved'/)
})

test('Creative Memory is injected separately from factual evidence', () => {
  assert.match(enterprise, /CREATIVE MEMORY — VALIDATED APPROACH PATTERNS \(HOW TO SOLVE\/PRESENT, NEVER FACTUAL EVIDENCE\)/)
  assert.match(enterprise, /\[CM#\] is validated creative\/strategic guidance/)
  assert.match(enterprise, /never treat it as a fact/)
  assert.match(enterprise, /never cite \[CM#\] to the user/)
})

test('Creative Memory changes cache identity and is present in provenance', () => {
  assert.match(enterprise, /creativeMemories:context\.creativeMemories/)
  assert.match(enterprise, /creativeMemoriesUsed:context\.creativeMemories\.length/)
  assert.match(enterprise, /creativeMemoryFunnel:executionCreativeMemoryFunnel\(context, false\)/)
  assert.match(enterprise, /creativeMemoryFunnel:executionCreativeMemoryFunnel\(context, true\)/)
})

test('initial approved patterns improve travel, transform continuity and proactive completion immediately', () => {
  assert.match(migration, /short_budget_city_itinerary/)
  assert.match(migration, /conversation_transformation/)
  assert.match(migration, /proactive_completion/)
  assert.match(migration, /Do not treat a transport-only source as an attraction/)
  assert.match(migration, /Bind the immediately preceding assistant answer as the source artifact/)
  assert.match(migration, /Finish the requested task first/)
})


test('Creative Memory RPC is service-role only', () => {
  const privileges = readFileSync(join(ROOT, 'supabase/migrations/20260923193500_cos_creative_memory_privileges.sql'), 'utf8')
  assert.match(privileges, /revoke all on table public\.cos_creative_memory from public, anon, authenticated/i)
  assert.match(privileges, /grant select, insert, update, delete on table public\.cos_creative_memory to service_role/i)
  assert.match(privileges, /revoke all on function public\.cos_match_creative_memory[\s\S]*from public, anon, authenticated/i)
  assert.match(privileges, /grant execute on function public\.cos_match_creative_memory[\s\S]*to service_role/i)
})

test('Creative Memory embeddings are maintained by the canonical knowledge lifecycle', () => {
  const cron = readFileSync(join(ROOT, 'app/api/cron/cos-knowledge-promotion/route.ts'), 'utf8')
  const manual = readFileSync(join(ROOT, 'app/api/admin/cos-knowledge-promotion/trigger/route.ts'), 'utf8')
  const reembed = readFileSync(join(ROOT, 'app/api/admin/cos-learning/reembed-current-space/route.ts'), 'utf8')
  for (const source of [cron, manual, reembed]) assert.match(source, /backfillCreativeMemoryEmbeddings/)
})
