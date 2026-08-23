import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { recordedSourceForProvenance, responseLineageStrength } from '../lib/ai/cos/responseLineage.ts'

const persistenceSource = readFileSync(new URL('../lib/ai/cos/cosPrimaryTurnProvenance.ts', import.meta.url), 'utf8')
const supportPersistenceSource = readFileSync(new URL('../lib/ai/cos/supportTurnProvenance.ts', import.meta.url), 'utf8')
const baseRouteSource = readFileSync(new URL('../app/api/cos-primary/baseRoute.ts', import.meta.url), 'utf8')

const acceptedSecondLocal = {
  turnId: '228335b7-52de-451d-80b1-50d85eb58a08',
  local_reasoning: {
    invoked: true,
    model: 'managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B',
    confidence: 0.78,
    threshold: 0.72,
  },
  external_ai: { invoked: false, provider: null, model: null },
  answer_origin: { from_cache: false, model: null },
}

const rejectedOuterAttempt = {
  turnId: '3bc53eed-3a14-40d2-89cd-c1256bcb3da9',
  local_reasoning: {
    invoked: true,
    model: 'managed-open-model:deepinfra:Qwen/Qwen3.6-35B-A3B',
    confidence: 0,
    threshold: 0.72,
  },
  external_ai: { invoked: false, provider: null, model: null },
  answer_origin: { from_cache: false, model: null },
}

test('the exact production second local answer outranks the rejected outer attempt', () => {
  assert.ok(responseLineageStrength(acceptedSecondLocal) > responseLineageStrength(rejectedOuterAttempt))
})

test('a real external provider lineage may supersede a local lineage when it actually generated the answer', () => {
  const external = {
    local_reasoning: { invoked: true, confidence: 0, threshold: 0.72 },
    external_ai: { invoked: true, provider: 'anthropic', model: 'claude-sonnet-4-6' },
    answer_origin: { from_cache: false, model: 'claude-sonnet-4-6' },
  }
  assert.ok(responseLineageStrength(external) > responseLineageStrength(acceptedSecondLocal))
  assert.equal(recordedSourceForProvenance('external_fallback', external), 'external_fallback')
})

test('source label cannot claim external fallback when telemetry says no external provider ran', () => {
  assert.equal(recordedSourceForProvenance('external_fallback', acceptedSecondLocal), 'cos-local-retry')
  assert.equal(recordedSourceForProvenance('external_fallback', rejectedOuterAttempt), 'cos-local-retry')
  assert.equal(recordedSourceForProvenance('external_fallback', {
    answer_origin: { from_cache: true, model: 'qwen' },
    external_ai: { invoked: false },
    local_reasoning: { invoked: false },
  }), 'cos-semantic-cache')
})

test('cache and deterministic origins rank above a rejected model attempt', () => {
  assert.ok(responseLineageStrength({ answer_origin: { from_cache: true, model: 'qwen' }, local_reasoning: { invoked: false } }) > responseLineageStrength(rejectedOuterAttempt))
  assert.ok(responseLineageStrength({ deterministic_utility: { used: true }, local_reasoning: { invoked: false } }) > responseLineageStrength(rejectedOuterAttempt))
})

test('COS-primary preserves stronger same-response provenance and retains weaker attempt only as superseded telemetry', () => {
  assert.match(persistenceSource, /recentResponseBoundLineage/)
  assert.match(persistenceSource, /existingStrength>candidateStrength/)
  assert.match(persistenceSource, /superseded_attempts/)
  assert.match(persistenceSource, /superseded_same_response_weaker_lineage/)
  assert.match(persistenceSource, /preserved stronger response-bound lineage/)
  assert.match(persistenceSource, /age>30_000/)
})

test('all latest-turn persistence normalizes source from actual recorded lineage', () => {
  assert.match(supportPersistenceSource, /recordedSourceForProvenance/)
  assert.match(supportPersistenceSource, /source:recordedSource/)
})

test('outer wrapper binds final response to embedded generator provenance and confidence', () => {
  assert.match(baseRouteSource, /embeddedExecutionProvenance/)
  assert.match(baseRouteSource, /embeddedMatchesGenerator/)
  assert.match(baseRouteSource, /confidence_score:finalConfidence/)
  assert.match(baseRouteSource, /execution_provenance:executionProvenance/)
  assert.match(baseRouteSource, /external_fallback_invoked:externalInvoked/)
  assert.match(baseRouteSource, /external_fallback_succeeded:externalInvoked&&!continuityFailed/)
  assert.match(baseRouteSource, /externalInvoked\?'external_fallback':innerSource/)
  assert.doesNotMatch(baseRouteSource, /external_fallback_invoked:true/)
  assert.doesNotMatch(baseRouteSource, /responseSource=continuityFailed\?'cos-independent-reasoner-unavailable':'external_fallback'/)
})

test('local retry telemetry is labeled local when the external trace says no provider ran', () => {
  assert.match(baseRouteSource, /externalInvoked\?'external_fallback':'local_cos_reasoning'/)
})
