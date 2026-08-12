import assert from 'node:assert/strict'
import test from 'node:test'
import { benchmarkExitCode, summarizeCosBenchmark, type CosBenchmarkObservation } from '../lib/ai/cos/cosBenchmark'

function observation(overrides: Partial<CosBenchmarkObservation>): CosBenchmarkObservation {
  return {
    id: 'case',
    category: 'utility',
    passed: true,
    confidence: 0.9,
    latencyMs: 25,
    responseSource: 'local_cos_reasoning',
    reasonerLabel: 'independent-local:test-model',
    knowledgeFactsUsed: 0,
    learnedItemsUsed: 0,
    userMemoriesUsed: 0,
    externalAiInvoked: false,
    localModelInvoked: true,
    ...overrides,
  }
}

const requiredProof: CosBenchmarkObservation[] = [
  observation({ id: 'date-time-timezone', category: 'utility', localModelInvoked: false, responseSource: 'deterministic' }),
  observation({ id: 'readonly-routing', category: 'routing', localModelInvoked: false, responseSource: 'deterministic' }),
  observation({ id: 'technical-reasoning', category: 'technical_reasoning' }),
  observation({ id: 'business-reasoning', category: 'business_reasoning' }),
  observation({ id: 'enterprise-memory', category: 'enterprise_memory', userMemoriesUsed: 2 }),
  observation({ id: 'knowledge-graph', category: 'knowledge_graph', knowledgeFactsUsed: 3 }),
  observation({ id: 'continuous-learning', category: 'continuous_learning', learnedItemsUsed: 2 }),
  observation({ id: 'cache-reuse', category: 'cache_reuse', localModelInvoked: false, responseSource: 'semantic_cache', inferenceAvoided: true }),
  observation({ id: 'provenance', category: 'provenance' }),
  observation({ id: 'zero-cloud', category: 'isolation', externalAiInvoked: false }),
]

test('COS production proof passes only with all required categories and evidence', () => {
  const summary = summarizeCosBenchmark(requiredProof, '2026-08-11T19:00:00-06:00')
  assert.equal(summary.total, 10)
  assert.equal(summary.failed, 0)
  assert.equal(summary.requiredCategoriesPass, true)
  assert.equal(summary.isolationPass, true)
  assert.equal(summary.cacheReusePass, true)
  assert.equal(summary.internalKnowledgeContributionPass, true)
  assert.equal(benchmarkExitCode(summary), 0)
})

test('COS production proof fails closed when any mandatory category is missing', () => {
  const summary = summarizeCosBenchmark(requiredProof.filter(item => item.category !== 'technical_reasoning'))
  assert.equal(summary.requiredCategoriesPass, false)
  assert.equal(benchmarkExitCode(summary), 1)
})

test('COS production proof fails closed when cache reuse still invokes inference', () => {
  const observations = requiredProof.map(item => item.category === 'cache_reuse'
    ? { ...item, inferenceAvoided: false, localModelInvoked: true }
    : item)
  const summary = summarizeCosBenchmark(observations)
  assert.equal(summary.cacheReusePass, false)
  assert.equal(benchmarkExitCode(summary), 1)
})

test('COS production proof fails closed when cloud AI appears in the isolation run', () => {
  const observations = requiredProof.map(item => item.category === 'isolation'
    ? { ...item, externalAiInvoked: true }
    : item)
  const summary = summarizeCosBenchmark(observations)
  assert.equal(summary.isolationPass, false)
  assert.equal(benchmarkExitCode(summary), 1)
})

test('COS production proof requires positive evidence for every internal knowledge category', () => {
  for (const category of ['enterprise_memory', 'knowledge_graph', 'continuous_learning'] as const) {
    const observations = requiredProof.map(item => item.category === category
      ? { ...item, userMemoriesUsed: 0, knowledgeFactsUsed: 0, learnedItemsUsed: 0 }
      : item)
    const summary = summarizeCosBenchmark(observations)
    assert.equal(summary.internalKnowledgeContributionPass, false)
    assert.equal(benchmarkExitCode(summary), 1)
  }
})
