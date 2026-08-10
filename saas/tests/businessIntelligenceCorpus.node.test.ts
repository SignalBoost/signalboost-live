import assert from 'node:assert/strict'
import test from 'node:test'
import { CORPUS_DEFAULT_MIN_CONFIDENCE, CORPUS_TARGET_RECORDS, clampConfidence, isFresh, normalizeDomain } from '../lib/business-intelligence-corpus/contracts'
import { evaluateCorpusEvidence } from '../lib/prospect-intelligence/corpus-policy.ts'
import { corpusAvoidanceEvent } from '../lib/prospect-intelligence/corpus-telemetry.ts'
import { buildCorpusRefreshPlan } from '../lib/prospect-intelligence/corpus-refresh.ts'

const nowIso = new Date().toISOString()

test('corpus target remains 5000 companies', () => {
  assert.equal(CORPUS_TARGET_RECORDS, 5000)
})

test('domain normalization is deterministic', () => {
  assert.equal(normalizeDomain('https://www.Example.com/path'), 'example.com')
  assert.equal(normalizeDomain('example.com'), 'example.com')
})

test('confidence is bounded', () => {
  assert.equal(clampConfidence(2), 1)
  assert.equal(clampConfidence(-1), 0)
  assert.ok(CORPUS_DEFAULT_MIN_CONFIDENCE > 0.5)
})

test('freshness depends on explicit expiry', () => {
  const base = {
    canonicalDomain: 'example.com', companyName: 'Example', aliases: [], attributes: {}, confidence: 0.9,
    sourceType: 'curated' as const, sourceIds: ['seed'], verifiedAt: '2026-08-09T00:00:00.000Z',
    refreshedAt: '2026-08-09T00:00:00.000Z', expiresAt: '2026-09-09T00:00:00.000Z',
  }
  assert.equal(isFresh(base, Date.parse('2026-08-10T00:00:00.000Z')), true)
  assert.equal(isFresh(base, Date.parse('2026-10-10T00:00:00.000Z')), false)
})

test('fresh high-confidence internal evidence prevents external enrichment', () => {
  const result = evaluateCorpusEvidence([{ source: 'enterprise_memory', confidence: 0.94, completeness: 0.9, verifiedAt: nowIso }])
  assert.equal(result.sufficient, true)
  assert.equal(result.enrichExternally, false)
})

test('stale or weak internal evidence requests enrichment', () => {
  const result = evaluateCorpusEvidence([{ source: 'curated_file', confidence: 0.55, completeness: 0.6, verifiedAt: '2020-01-01T00:00:00.000Z' }])
  assert.equal(result.sufficient, false)
  assert.equal(result.enrichExternally, true)
  assert.ok(result.reasons.includes('INTERNAL_CONFIDENCE_INSUFFICIENT'))
  assert.ok(result.reasons.includes('INTERNAL_EVIDENCE_STALE'))
})

test('internal resolution produces measurable avoided-cost event', () => {
  const event = corpusAvoidanceEvent({ resolvedInternally: true, plannedProviderCalls: 2, plannedAiCalls: 1, providerCostPerCallUsd: 0.1, aiCostPerCallUsd: 0.02 })
  assert.equal(event.externalProviderCallsAvoided, 2)
  assert.equal(event.aiCallsAvoided, 1)
  assert.equal(event.estimatedProviderCostAvoided, 0.2)
  assert.equal(event.estimatedAiCostAvoided, 0.02)
})

test('background refresh prioritizes weak recently-used records', () => {
  const now = Date.now()
  const plan = buildCorpusRefreshPlan([
    { id: 'strong', evidence: [{ source: 'enterprise_memory', confidence: 0.95, completeness: 0.95, verifiedAt: nowIso }], lastUsedAt: nowIso, priority: 1 },
    { id: 'weak-recent', evidence: [{ source: 'curated_file', confidence: 0.4, completeness: 0.5, verifiedAt: '2020-01-01T00:00:00.000Z' }], lastUsedAt: nowIso, priority: 0.8 },
    { id: 'weak-unused', evidence: [{ source: 'curated_file', confidence: 0.4, completeness: 0.5, verifiedAt: '2020-01-01T00:00:00.000Z' }], priority: 0.2 },
  ], { now })
  assert.deepEqual(plan.map(item => item.id), ['weak-recent', 'weak-unused'])
})
