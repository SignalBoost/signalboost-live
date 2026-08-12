// saas/tests/cosLearningRelevanceGate.node.test.ts
import assert from 'node:assert/strict'
import test from 'node:test'
import { ContinuousLearningDirector, DEFAULT_CONTINUOUS_LEARNING_POLICY, type ContinuousLearningStore, type KnowledgeGap, type LearningCandidate } from '../lib/cos-core/layers/learning/index'
import { ContinuousLearningCycle, confidenceFromRelevance, relevantExcerpt, gapStudyTerms, type ContinuousLearningSourceAdapter, type LearningSourceDocument } from '../lib/cos-core/layers/learning/cycle'

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

// The literal row found in production: a YouTube promo stored as knowledge about Postgres.
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

const REAL_POSTGRES_DOC: LearningSourceDocument = {
  sourceKind: 'video_transcript',
  sourceUri: 'https://www.postgresql.org/docs/current/monitoring-stats.html',
  sourceTitle: 'PostgreSQL monitoring statistics and wait events',
  observedAt: '2026-08-11T04:08:39.000Z',
  subject: 'PostgreSQL database performance multi tenant SaaS',
  text: 'Subscribe to the channel and hit the bell icon. In PostgreSQL, pg_stat_statements records execution statistics for every normalised statement, including total execution time and buffer reads. pg_stat_activity exposes wait events, letting an operator distinguish time spent executing a query from time spent waiting on a connection pool or a lock. Buffer statistics reveal whether a tenant workload has outgrown shared memory.',
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
  assert.ok(stored.confidence <= 0.85, 'keyword overlap must never claim near-certainty')
  assert.notEqual(stored.confidence, 0.8, 'confidence must be derived, not the old constant')
  assert.equal(stored.facts[0].predicate, 'source_excerpt')
})

test('the stored excerpt is the passage that answers the gap, not the opening boilerplate', () => {
  const terms = gapStudyTerms(POSTGRES_GAP)
  const normalized = REAL_POSTGRES_DOC.text.replace(/\s+/g, ' ').trim()
  const excerpt = relevantExcerpt(normalized, terms, 1200)

  assert.ok(!excerpt.includes('hit the bell icon'), 'promotional lead-in must not survive as knowledge')
  assert.ok(excerpt.includes('pg_stat_activity'), 'the passage answering the question must be kept')
})

test('confidence is monotonic in coverage and bounded', () => {
  assert.equal(confidenceFromRelevance(0), 0)
  assert.ok(confidenceFromRelevance(0.5) < confidenceFromRelevance(0.9))
  assert.ok(confidenceFromRelevance(1) <= 0.85)
})
