import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const route = readFileSync(new URL('../app/api/admin/cos-learning/backfill-embeddings/route.ts', import.meta.url), 'utf8')
const page = readFileSync(new URL('../app/dashboard/cos-learning/page.tsx', import.meta.url), 'utf8')
const copy = readFileSync(new URL('../lib/i18n/cosLearningCopy.ts', import.meta.url), 'utf8')
const semantic = readFileSync(new URL('../lib/ai/cos/learnedCorpusSemantic.ts', import.meta.url), 'utf8')

test('learned-corpus bulk embedding is owner-only and bounded', () => {
  assert.match(route, /requireOwner\(\)/)
  assert.match(route, /const BATCH_SIZE = 8/)
  assert.match(route, /const MAX_BATCHES = 12/)
  assert.match(route, /export const maxDuration = 300/)
  assert.match(route, /ensureLocalInferenceRuntimeReady\(\)/)
  assert.match(route, /touchRunpodActivityLease\('learned_corpus_embedding_backfill'\)/)
  assert.match(route, /backfillLearnedCorpusEmbeddings\(BATCH_SIZE\)/)
  assert.match(route, /if \(remaining === 0 \|\| result\.attempted === 0\) break/)
  assert.match(route, /if \(result\.embedded === 0\) break/)
})

test('embedding status separates total, eligible, embedded, pending and rejected rows', () => {
  assert.match(semantic, /getLearnedCorpusEmbeddingStats/)
  assert.match(semantic, /const eligible = Math\.max\(0, total - rejected\)/)
  assert.match(semantic, /const pending = Math\.max\(0, eligible - eligibleEmbedded\)/)
  assert.match(route, /\.\.\.stats, remaining: stats\.pending/)
  assert.match(route, /authRequired: guard\.status === 401/)
})

test('COS Learning dashboard exposes the bounded owner backfill action with explicit session handling', () => {
  assert.match(page, /\/api\/admin\/cos-learning\/backfill-embeddings/)
  assert.match(page, /onClick=\{embedAll\}/)
  assert.match(page, /credentials: 'include'/)
  assert.match(page, /CANONICAL_HOST = 'saas\.signalboostapp\.com'/)
  assert.match(page, /copy\.ownerSessionRequired/)
  assert.match(page, /copy\.embeddingEligible/)
  assert.match(page, /copy\.embeddingEmbedded/)
  assert.match(page, /copy\.embeddingBacklog/)
  assert.match(page, /copy\.embeddingRejected/)
  assert.match(page, /copy\.embedAll/)
  assert.match(page, /copy\.embeddingsRemaining/)
})

test('embedding and auth controls are localized in every COS Learning language', () => {
  for (const language of ['en', 'es', 'pt', 'pl', 'ru']) {
    assert.match(copy, new RegExp(`\\b${language}:\\{[^}]*embeddingBacklog:`))
    assert.match(copy, new RegExp(`\\b${language}:\\{[^}]*ownerSessionRequired:`))
    assert.match(copy, new RegExp(`\\b${language}:\\{[^}]*canonicalHostRequired:`))
  }
})
