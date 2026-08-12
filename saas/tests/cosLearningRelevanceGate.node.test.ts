import assert from 'node:assert/strict'
import test from 'node:test'
import { ContinuousLearningDirector, DEFAULT_CONTINUOUS_LEARNING_POLICY, type ContinuousLearningStore, type KnowledgeGap, type LearningCandidate } from '../lib/cos-core/layers/learning/index'
import { ContinuousLearningCycle, groundedConfidence, substanceOf, relevantExcerpt, gapStudyTerms, type ContinuousLearningSourceAdapter, type LearningSourceDocument } from '../lib/cos-core/layers/learning/cycle'

class MemoryStore implements ContinuousLearningStore {
  records = new Map<string, LearningCandidate>()
  async hasContent(hash: string) { return this.records.has(hash) }
  async remember(candidate: LearningCandidate) { this.records.set(candidate.contentHash, candidate) }
}

const POSTGRES_GAP: KnowledgeGap = {
  id: 'foundational:postgres:2',
  subject: 'PostgreSQL database performance multi tenant SaaS',
  question: 'How can pg_stat_statements, pg_stat_activity, wait events and buffer statistics distinguish query execution from pool wait latency?',
  portableIds: ['cos'],
  expectedReuse: 100,
  expectedAvoidedCostUsd: 10,
  urgency: 90,
  evidence: ['SignalBoost foundational COS curriculum.'],
}

function adapterOf(documents: LearningSourceDocument[]): ContinuousLearningSourceAdapter {
  return { kind: 'video_transcript', id: 'test', acquire: async () => documents }
}

const AGENTIC_RAG_PROMO: LearningSourceDocument = {
  sourceKind: 'video_transcript',
  sourceUri: 'https://www.youtube.com/watch?v=example',
  sourceTitle: 'Agentic RAG vs RAGs',
  observedAt: '2026-08-11T04:08:39.000Z',
  subject: 'PostgreSQL database performance multi tenant SaaS',
  text: "Agentic RAG vs RAGs. RAG wasn't replaced - it evolved into Agentic RAGs! What is RAG? - Retrieval: Gets relevant data from sources - Augmentation. Channel: Rakesh Gohel.",
}

const LABOUR_ECONOMICS_PAPER: LearningSourceDocument = {
  sourceKind: 'video_transcript',
  sourceUri: 'https://doi.org/10.0000/example',
  sourceTitle: 'Recent Developments in the European Labor Market',
  observedAt: '2026-08-11T04:08:39.000Z',
  subject: 'PostgreSQL database performance multi tenant SaaS',
  text: 'Recent Developments in the European Labor Market. Publisher: American Economic Association. Wage growth and participation rates across member states.',
}

const TRANSCRIPT_BODY = [
  'Subscribe to the channel and hit the bell icon before we start.',
  'In PostgreSQL, pg_stat_statements records execution statistics for every normalised statement, including total execution time, mean execution time and shared buffer reads.',
  'That view answers the first question in any latency investigation: is the database actually spending time executing this query, or is the time being spent somewhere else entirely.',
  'pg_stat_activity exposes the wait events of every backend, which lets an operator distinguish time spent executing a query from time spent waiting on a connection pool, a lock, or client I/O.',
  'When aggregate CPU and memory look normal but tail latency triples, the time is almost always queueing rather than compute, and wait events are where that shows up.',
  'Connection pool starvation is the classic multi tenant SaaS case: a large tenant holds pooled connections for longer, smaller tenants queue behind it, and the database itself never looks busy.',
  'Idle in transaction sessions produce the same signature, because the connection is held without any query running on it.',
  'Buffer statistics reveal whether a tenant workload has outgrown shared memory, at which point an index that used to be resident starts being read from disk for large tenants only.',
  'Query plans change without any deployment when statistics are refreshed by autovacuum, so a plan that was an index scan for every tenant can become a sequential scan above a row count threshold that only the largest tenants cross.',
  'All of this can be read without mutating production: pg_stat_statements deltas, pg_stat_activity samples, buffer statistics and the pool metrics your application already exports.',
].join(' ')

const REAL_POSTGRES_DOC: LearningSourceDocument = {
  sourceKind: 'video_transcript',
  sourceUri: 'https://www.youtube.com/watch?v=transcript',
  sourceTitle: 'Diagnosing PostgreSQL tail latency in multi tenant SaaS',
  observedAt: '2026-08-11T04:08:39.000Z',
  subject: 'PostgreSQL database performance multi tenant SaaS',
  text: TRANSCRIPT_BODY,
}

const SHORT_ON_TOPIC_BLURB: LearningSourceDocument = {
  sourceKind: 'video_transcript',
  sourceUri: 'https://www.youtube.com/watch?v=blurb',
  sourceTitle: 'PostgreSQL performance for multi tenant SaaS',
  observedAt: '2026-08-11T04:08:39.000Z',
  subject: 'PostgreSQL database performance multi tenant SaaS',
  text: 'PostgreSQL performance for multi tenant SaaS. We cover pg_stat_statements, wait events and connection pool latency. Channel: Some Channel.',
}

test('off-topic documents are rejected with a stated reason instead of being stored as knowledge', async () => {
  const store = new MemoryStore()
  const cycle = new ContinuousLearningCycle(new ContinuousLearningDirector(store, DEFAULT_CONTINUOUS_LEARNING_POLICY), [adapterOf([AGENTIC_RAG_PROMO, LABOUR_ECONOMICS_PAPER])])
  const result = await cycle.run([POSTGRES_GAP], 0)

  assert.equal(result.documentsAcquired, 2)
  assert.equal(result.accepted, 0, 'neither production junk row may be admitted')
  assert.equal(result.rejected.not_relevant, 2)
  assert.equal(store.records.size, 0)
})

test('a genuinely on-topic document is admitted with a measured, non-constant confidence', async () => {
  const store = new MemoryStore()
  const cycle = new ContinuousLearningCycle(new ContinuousLearningDirector(store, DEFAULT_CONTINUOUS_LEARNING_POLICY), [adapterOf([REAL_POSTGRES_DOC])])
  const result = await cycle.run([POSTGRES_GAP], 0)

  assert.equal(result.accepted, 1)
  const stored = [...store.records.values()][0]
  assert.ok(stored.confidence >= 0.72, 'must clear the director threshold')
  assert.ok(stored.confidence <= 0.92, 'grounding must never claim verification')
  assert.notEqual(stored.confidence, 0.8, 'confidence must be derived, not the old constant')
  assert.equal(stored.facts[0].predicate, 'source_excerpt')
})

test('the stored excerpt is the passage that answers the gap, not the opening boilerplate', () => {
  const { anchors, supporting } = gapStudyTerms(POSTGRES_GAP)
  const normalized = REAL_POSTGRES_DOC.text.replace(/\s+/g, ' ').trim()
  const excerpt = relevantExcerpt(normalized, [...anchors, ...supporting], 1200)

  assert.ok(!excerpt.includes('hit the bell icon'), 'promotional lead-in must not survive as knowledge')
  assert.ok(excerpt.includes('pg_stat_activity'), 'the passage answering the question must be kept')
})

test('confidence rises with coverage AND substance, and never claims verification', () => {
  assert.equal(groundedConfidence(0, 0), 0)
  assert.ok(groundedConfidence(0.5, 0.5) < groundedConfidence(0.9, 0.9))
  assert.ok(groundedConfidence(1, 1) <= 0.92)
  assert.ok(groundedConfidence(1, substanceOf('short blurb about postgresql pooling')) < 0.82)
})

test('an on-topic blurb is admitted as a capped pointer, never as full-text-grade knowledge', async () => {
  const store = new MemoryStore()
  const cycle = new ContinuousLearningCycle(new ContinuousLearningDirector(store, DEFAULT_CONTINUOUS_LEARNING_POLICY), [adapterOf([SHORT_ON_TOPIC_BLURB])])
  const result = await cycle.run([POSTGRES_GAP], 0)

  assert.equal(result.accepted, 1, 'a relevant pointer is worth keeping — as what it is')
  const stored = [...store.records.values()][0]
  assert.ok(stored.confidence <= 0.7, `a blurb may never exceed the metadata ceiling, got ${stored.confidence}`)
  assert.ok(stored.confidence < 0.72, 'and never reaches the full-text floors')
})

test('metadata confidence is honest — never raised to meet its own admission floor', async () => {
  const { calibratedConfidence, admissionFloorFor, groundedConfidence, substanceOf, relevanceOf, gapStudyTerms } = await import('../lib/cos-core/layers/learning/cycle.ts')
  const doc = {
    sourceKind: 'scientific_journal',
    sourceUri: 'https://doi.org/10.0000/blurb',
    sourceTitle: 'PostgreSQL performance in multi tenant SaaS systems',
    subject: 'PostgreSQL database performance multi tenant SaaS',
    text: 'PostgreSQL performance in multi tenant SaaS systems. Publisher: Example Press.',
    license: 'Bibliographic metadata from CrossRef discovery API',
  } as never
  const score = relevanceOf(doc, gapStudyTerms(POSTGRES_GAP))
  const stored = calibratedConfidence(doc, score, (doc as { text: string }).text)

  assert.equal(stored, groundedConfidence(score.coverage, substanceOf((doc as { text: string }).text)), 'stored confidence must equal honest grounding')
  const floor = admissionFloorFor(doc)
  assert.ok(floor !== null && floor < 0.72, 'metadata admits on a LOWER bar, not an inflated number')
})
