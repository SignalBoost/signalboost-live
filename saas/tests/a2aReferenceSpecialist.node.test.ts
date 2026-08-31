import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REFERENCE_DIAGNOSTIC_AGENT_ID,
  REFERENCE_DIAGNOSTIC_SKILL_ID,
  diagnoseReferenceIncident,
  referenceDiagnosticArtifactText,
} from '../a2a-host/reference-self-healing-diagnostic.ts'

test('reference specialist classifies upstream timeout evidence and stays advisory', () => {
  const result = diagnoseReferenceIncident('API returned 504 gateway timeout after upstream dependency latency increased.')
  assert.equal(result.classification, 'upstream_timeout_or_network')
  assert.ok(result.confidence >= 0.62)
  assert.ok(result.recommendedNextChecks.some(item => /upstream latency/i.test(item)))
})

test('reference specialist fails toward evidence collection when signal is insufficient', () => {
  const result = diagnoseReferenceIncident('The service behaves strangely in production.')
  assert.equal(result.classification, 'insufficient_signal')
  assert.ok(result.recommendedNextChecks.every(item => /provide|error|trace|log|metric|timestamp/i.test(item)))
})

test('reference artifact is real structured diagnostic output, not a placeholder', () => {
  const parsed = JSON.parse(referenceDiagnosticArtifactText('Postgres connection pool exhausted and SQL query latency spiked.'))
  assert.equal(parsed.specialist, REFERENCE_DIAGNOSTIC_AGENT_ID)
  assert.equal(parsed.skill, REFERENCE_DIAGNOSTIC_SKILL_ID)
  assert.equal(parsed.advisoryOnly, true)
  assert.equal(parsed.classification, 'datastore_or_query')
  assert.ok(Array.isArray(parsed.recommendedNextChecks) && parsed.recommendedNextChecks.length >= 3)
  assert.equal(/todo|placeholder|not implemented|coming soon/i.test(JSON.stringify(parsed)), false)
})

test('reference specialist rejects empty or oversized incident payloads', () => {
  assert.throws(() => diagnoseReferenceIncident('short'), /too_short/)
  assert.throws(() => diagnoseReferenceIncident('x'.repeat(32001)), /too_large/)
})
