import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

// Canonical acceptance coverage for retained knowledge becoming semantically reusable.
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')

test('continuous indexer prioritizes newest eligible retained knowledge and stale vector spaces', () => {
  const source = read('../lib/ai/cos/learnedCorpusIndexing.ts')
  assert.match(source, /embeddingModelName/)
  assert.match(source, /embedding\.is\.null,embedding_model\.is\.null/)
  assert.match(source, /\.neq\('embedding_model', model\)/)
  assert.match(source, /fact_extraction_error\.is\.null/)
  assert.match(source, /relevance_rejected:/)
  assert.match(source, /\.order\('created_at', \{ ascending: false \}\)/)
  assert.match(source, /Math\.min\(32/)
  assert.match(source, /Math\.min\(4/)
  assert.match(source, /embedLearnedCorpusRow/)
  assert.match(source, /countPendingLearnedCorpusIndexing/)
})

test('indexing cron is authenticated, bounded, and wakes compute only when work exists', () => {
  const source = read('../app/api/cron/cos-learning-indexer/route.ts')
  assert.match(source, /CRON_SECRET/)
  assert.match(source, /Bearer \$\{secret\}/)
  const preflight = source.indexOf('await countPendingLearnedCorpusIndexing()')
  const lease = source.indexOf("await touchRunpodActivityLease('learned_corpus_index_batch')")
  const readiness = source.indexOf('await ensureLocalInferenceRuntimeReady()')
  assert.ok(preflight >= 0, 'cron must inspect pending work before touching GPU activity')
  assert.ok(lease > preflight, 'lease must be touched only after pending-work preflight')
  assert.ok(readiness > lease, 'runtime readiness must occur only after work is confirmed')
  assert.match(source, /if \(pending === 0\)/)
  assert.match(source, /reason: 'no_indexing_work'/)
  assert.match(source, /limit: 16/)
  assert.match(source, /concurrency: 4/)
})

test('current-world cron learns first and indexes newly accepted rows from the same run', () => {
  const source = read('../app/api/cron/cos-current-world-learning/route.ts')
  const run = source.indexOf('await cycle.run(')
  const index = source.indexOf('await indexRecentUnembeddedLearnedCorpus(')
  assert.ok(run >= 0)
  assert.ok(index > run)
  assert.match(source, /createdAfter: startedAt/)
  assert.match(source, /minimumConfidence: 0\.6/)
  assert.match(source, /maxExternalCostUsdPerCycle: 0/)
})

test('Vercel schedules frequent indexing and hourly current-world refresh', () => {
  const config = JSON.parse(read('../vercel.json'))
  const indexer = config.crons.find((entry: any) => entry.path === '/api/cron/cos-learning-indexer')
  const currentWorld = config.crons.find((entry: any) => entry.path === '/api/cron/cos-current-world-learning')
  assert.equal(indexer?.schedule, '3,18,33,48 * * * *')
  assert.equal(currentWorld?.schedule, '14 * * * *')
})
