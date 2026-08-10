import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateCorpusEvidence } from '../lib/prospect-intelligence/corpus-policy.ts'
import { corpusAvoidanceEvent } from '../lib/prospect-intelligence/corpus-telemetry.ts'

test('fresh high-confidence internal evidence prevents external enrichment', () => {
  const result = evaluateCorpusEvidence([{
    source: 'enterprise_memory',
    confidence: 0.94,
    completeness: 0.9,
    verifiedAt: new Date().toISOString(),
  }])
  assert.equal(result.sufficient, true)
  assert.equal(result.enrichExternally, false)
})

test('stale or weak internal evidence requests enrichment', () => {
  const result = evaluateCorpusEvidence([{
    source: 'curated_file',
    confidence: 0.55,
    completeness: 0.6,
    verifiedAt: '2020-01-01T00:00:00.000Z',
  }])
  assert.equal(result.sufficient, false)
  assert.equal(result.enrichExternally, true)
  assert.ok(result.reasons.includes('INTERNAL_CONFIDENCE_INSUFFICIENT'))
  assert.ok(result.reasons.includes('INTERNAL_EVIDENCE_STALE'))
})

test('internal resolution produces measurable avoided-cost event', () => {
  const event = corpusAvoidanceEvent({
    resolvedInternally: true,
    plannedProviderCalls: 2,
    plannedAiCalls: 1,
    providerCostPerCallUsd: 0.1,
    aiCostPerCallUsd: 0.02,
  })
  assert.equal(event.externalProviderCallsAvoided, 2)
  assert.equal(event.aiCallsAvoided, 1)
  assert.equal(event.estimatedProviderCostAvoided, 0.2)
  assert.equal(event.estimatedAiCostAvoided, 0.02)
})
