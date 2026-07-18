import assert from 'node:assert/strict'
import test from 'node:test'
import {
  calculateCampaignPerformanceScore,
  normalizeCampaignLearning,
} from '../lib/enterprise/memory/campaignLearning.ts'

const NOW = Date.parse('2026-07-18T12:00:00.000Z')

test('normalizes campaign lifecycle evidence and derives bounded performance', () => {
  const result = normalizeCampaignLearning({
    generatedVersion: { headline: 'Generated' },
    humanEdits: { headline: 'Owner edit' },
    approvedVersion: { headline: 'Approved' },
    publishedVersion: { headline: 'Published' },
    rejectedSuggestions: Array.from({ length: 60 }, (_, index) => index),
    metrics: { impressions: 1000, clicks: 100, conversions: 20, revenue: 500, cost: 100 },
    winningCta: '  Start now  ',
    winningCreative: '  Product demo  ',
    publishedAt: '2026-07-18T11:00:00.000Z',
  }, NOW)

  assert.equal(result.winningCta, 'Start now')
  assert.equal(result.winningCreative, 'Product demo')
  assert.equal(result.rejectedSuggestions.length, 50)
  assert.equal(result.publishedAt, '2026-07-18T11:00:00.000Z')
  assert.ok(result.performanceScore > 0 && result.performanceScore <= 1)
})

test('invalid numbers, payloads, and future dates fail closed', () => {
  const result = normalizeCampaignLearning({
    generatedVersion: [] as unknown as Record<string, unknown>,
    metrics: { impressions: -1, clicks: Number.NaN, conversions: 10, revenue: -20, cost: -5 },
    publishedAt: '2027-01-01T00:00:00.000Z',
  }, NOW)

  assert.deepEqual(result.generatedVersion, {})
  assert.equal(result.metrics.impressions, 0)
  assert.equal(result.metrics.clicks, 0)
  assert.equal(result.metrics.revenue, 0)
  assert.equal(result.publishedAt, null)
  assert.equal(result.performanceScore, 0)
})

test('performance score is deterministic and bounded', () => {
  const metrics = { impressions: 100, clicks: 500, conversions: 900, revenue: 1000000, cost: 1 }
  const first = calculateCampaignPerformanceScore(metrics)
  const second = calculateCampaignPerformanceScore(metrics)

  assert.equal(first, second)
  assert.ok(first >= 0 && first <= 1)
})

test('invalid learning clock is rejected', () => {
  assert.throws(() => normalizeCampaignLearning({}, Number.NaN), /clock must be finite/)
})
