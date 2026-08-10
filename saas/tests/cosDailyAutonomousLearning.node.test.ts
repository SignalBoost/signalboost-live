import assert from 'node:assert/strict'
import test from 'node:test'
import { runDailyAutonomousLearning } from '../lib/cos/dailyAutonomousLearning'
import type { ContinuousLearningStore, LearningCandidate } from '../lib/cos-core/layers/learning'
import type { ContinuousLearningMetric } from '../lib/cos-core/layers/learning/telemetry'
import type { ContinuousLearningSourceAdapter } from '../lib/cos-core/layers/learning/cycle'

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
  assert.equal(first.autonomousGaps, 0)
  assert.equal(first.accepted, 1)
  assert.equal(store.records.size, 1)

  const second = await runDailyAutonomousLearning({ miningSummary: summary, store, telemetry, approvedUrls: [] })
  assert.equal(second.externalCostUsd, 0)
  assert.equal(second.accepted, 0)
  assert.equal(second.rejected.duplicate, 1)
  assert.equal(store.records.size, 1)
  assert.equal(metrics.length, 2)
})

test('daily COS learning consumes self-generated knowledge gaps', async () => {
  const store = new MemoryStore()
  const adapter: ContinuousLearningSourceAdapter = {
    async acquire(gap) {
      if (!gap.id.startsWith('auto-gap:')) return []
      return [{
        sourceKind: 'official_documentation',
        sourceUri: `https://docs.example.test/${encodeURIComponent(gap.id)}`,
        sourceTitle: 'Approved documentation',
        observedAt: '2026-08-09T00:00:00.000Z',
        subject: gap.subject,
        text: `Verified reusable guidance for ${gap.question}`,
        license: 'approved',
        evidence: ['approved deterministic test source'],
      }]
    },
  }

  const result = await runDailyAutonomousLearning({
    miningSummary: summary,
    store,
    approvedUrls: [],
    adapters: [adapter],
    gapSignals: [{
      taskId: 'reasoning-1',
      subject: 'email delivery',
      capability: 'outreach',
      objective: 'deliver outreach drafts reliably',
      confidence: 0.35,
      escalated: true,
      succeeded: false,
      missingFacts: ['provider delivery-state semantics'],
      repeatedCount: 4,
      externalCostUsd: 0.02,
    }],
  })

  assert.equal(result.externalCostUsd, 0)
  assert.equal(result.autonomousGaps, 1)
  assert.equal(result.gapsConsidered, 2)
  assert.ok(result.accepted >= 2)
  assert.ok([...store.records.values()].some(record => record.subject === 'email delivery'))
})

test('daily COS learning only accepts explicitly configured https school URLs', async () => {
  const { parseApprovedLearningUrls } = await import('../lib/cos/dailyAutonomousLearning')
  assert.deepEqual(
    parseApprovedLearningUrls('https://docs.example.com/feed,http://unsafe.example.com,not-a-url,https://docs.example.com/feed'),
    ['https://docs.example.com/feed'],
  )
})
