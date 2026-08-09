import assert from 'node:assert/strict'
import test from 'node:test'
import { ContinuousLearningDirector, type LearningCandidate, type ContinuousLearningStore } from '../lib/cos-core/layers/learning/index'
import { ContinuousLearningCycle } from '../lib/cos-core/layers/learning/cycle'
import { staticLearningSourceAdapter } from '../lib/cos-core/layers/learning/adapters'
import { runLearningCycleWithTelemetry, type ContinuousLearningMetric } from '../lib/cos-core/layers/learning/telemetry'

class MemoryStore implements ContinuousLearningStore {
  records = new Map<string, LearningCandidate>()
  async hasContent(hash: string) { return this.records.has(hash) }
  async remember(candidate: LearningCandidate) { this.records.set(candidate.contentHash, candidate) }
}

test('COS acquires, validates, persists, deduplicates and emits zero-cost learning telemetry', async () => {
  const store = new MemoryStore()
  const director = new ContinuousLearningDirector(store, {
    allowedSources: ['internal_library'],
    minimumConfidence: 0.7,
    maxCandidatesPerCycle: 10,
    maxExternalCostUsdPerCycle: 0,
  })
  const adapter = staticLearningSourceAdapter('internal_library', [{
    sourceKind: 'internal_library',
    sourceUri: 'signalboost://library/buyer-intelligence',
    sourceTitle: 'Buyer Intelligence',
    observedAt: '2026-08-09T00:00:00.000Z',
    subject: 'Brazil MSP buyers',
    text: 'Brazilian managed service providers operating AWS Azure GCP and Kubernetes are relevant buyer candidates.',
    license: 'internal',
  }])
  const cycle = new ContinuousLearningCycle(director, [adapter])
  const gaps = [{
    id: 'gap-1',
    subject: 'Brazil MSP buyers',
    question: 'Which Brazilian managed service providers are relevant buyers?',
    evidence: ['No durable buyer knowledge exists yet.'],
    priority: 1,
    createdAt: '2026-08-09T00:00:00.000Z',
  }]
  const metrics: ContinuousLearningMetric[] = []
  const sink = { record: async (metric: ContinuousLearningMetric) => { metrics.push(metric) } }

  const first = await runLearningCycleWithTelemetry(() => cycle.run(gaps, 0), sink)
  assert.equal(first.accepted, 1)
  assert.equal(first.externalCostUsd, 0)
  assert.equal(store.records.size, 1)
  assert.equal(metrics.length, 1)
  assert.equal(metrics[0].accepted, 1)
  assert.equal(metrics[0].externalCostUsd, 0)

  const second = await runLearningCycleWithTelemetry(() => cycle.run(gaps, 0), sink)
  assert.equal(second.accepted, 0)
  assert.equal(second.rejected.duplicate, 1)
  assert.equal(store.records.size, 1)
  assert.equal(metrics.length, 2)
})
