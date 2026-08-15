import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyDeterministicToolOutcome,
  extractCouncilCorrelationRefs,
  normalizeCouncilObjectiveOutcome,
} from '../lib/ai/cos/councilObjectiveOutcomePure.ts'

test('extracts exact incident and execution correlations from governed JSON context', () => {
  const refs = extractCouncilCorrelationRefs(JSON.stringify({
    incident_id: 'incident-prod-123',
    traceId: 'trace-456',
    execution_id: 'exec-789',
  }))
  assert.equal(refs.incident_id, 'incident-prod-123')
  assert.equal(refs.trace_id, 'trace-456')
  assert.equal(refs.execution_id, 'exec-789')
})

test('explicit deterministic read-back verification is success', () => {
  const result = classifyDeterministicToolOutcome({
    ok: true,
    result: { verified: true, changed: true, policyInstanceId: 'vercel-observation-cron' },
  })
  assert.equal(result.status, 'success')
  assert.equal(result.facts.verified, true)
  assert.equal(result.facts.policyInstanceId, 'vercel-observation-cron')
})

test('successful execution without verification remains observed rather than pretending recovery', () => {
  const result = classifyDeterministicToolOutcome({ ok: true, result: { accepted: true } })
  assert.equal(result.status, 'observed')
})

test('explicit deterministic verification failure is failure', () => {
  const result = classifyDeterministicToolOutcome({ ok: true, result: { verified: false } })
  assert.equal(result.status, 'failure')
})

test('model references cannot masquerade as objective outcome sources', () => {
  assert.throws(() => normalizeCouncilObjectiveOutcome({
    sourceClass: 'deterministic_tool',
    sourceRef: 'model:qwen-self-grade',
    correlation: { kind: 'incident_id', value: 'incident-prod-123' },
    outcomeStatus: 'success',
    summary: 'self reported success',
  }), /cannot be an objective outcome source/i)
})
