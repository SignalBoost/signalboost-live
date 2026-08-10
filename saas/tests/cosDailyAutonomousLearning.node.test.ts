import assert from 'node:assert/strict'
import test from 'node:test'
import { runDailyAutonomousLearning } from '../lib/cos/dailyAutonomousLearning'
import type { ContinuousLearningStore, LearningCandidate } from '../lib/cos-core/layers/learning'
import type { ContinuousLearningMetric } from '../lib/cos-core/layers/learning/telemetry'

class MemoryStore implements ContinuousLearningStore {
  records = new Map<string, LearningCandidate>()
  async hasContent(hash: string) { return this.records.has(hash) }
  async remember(candidate: LearningCandidate) { this.records.set(candidate.contentHash, candidate) }
}

const summary = {
  run_id: 'daily-learning-test',
  job: 'daily' as const,
  events_scanned: 120,
  users_processed: 12,
  features_written: 12,
  segments_written: 5,
  rules_found: 3,
}

test('daily COS learning persists and deduplicates with zero external AI cost', async () => {
  const store = new MemoryStore()
  const metrics: ContinuousLearningMetric[] = []
  const telemetry = { record: async (metric: ContinuousLearningMetric) => { metrics.push(metric) } }

  const first = await runDailyAutonomousLearning({ miningSummary: summary, store, telemetry, approvedUrls: [] })
  assert.equal(first.status, 'learned')
  assert.equal(first.externalCostUsd, 0)
  assert.equal(first.accepted, 1)
  assert.equal(store.records.size, 1)

  const second = await runDailyAutonomousLearning({ miningSummary: summary, store, telemetry, approvedUrls: [] })
  assert.equal(second.externalCostUsd, 0)
  assert.equal(second.accepted, 0)
  assert.equal(second.rejected.duplicate, 1)
  assert.equal(store.records.size, 1)
  assert.equal(metrics.length, 2)
})

test('daily COS learning only accepts explicitly configured https school URLs', async () => {
  const { parseApprovedLearningUrls } = await import('../lib/cos/dailyAutonomousLearning')
  assert.deepEqual(
    parseApprovedLearningUrls('https://docs.example.com/feed,http://unsafe.example.com,not-a-url,https://docs.example.com/feed'),
    ['https://docs.example.com/feed'],
  )
})
