import assert from 'node:assert/strict'
import test from 'node:test'
import { referenceDiagnosticAgentCard, referenceDiagnosticEndpoint, resolveReferenceA2AOrigin } from '../a2a-host/reference-a2a-config.ts'
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

test('reference origin is server-configured and never inferred from inbound request host', () => {
  const env = { VERCEL_URL: 'trusted-preview.example.vercel.app' } as NodeJS.ProcessEnv
  assert.equal(resolveReferenceA2AOrigin(env), 'https://trusted-preview.example.vercel.app')
  assert.equal(referenceDiagnosticEndpoint(env), 'https://trusted-preview.example.vercel.app/api/a2a/reference-diagnostic')
  assert.throws(() => resolveReferenceA2AOrigin({} as NodeJS.ProcessEnv), /origin_unconfigured/)
  assert.throws(() => resolveReferenceA2AOrigin({ SIGNALBOOST_A2A_REFERENCE_ORIGIN: 'http://attacker.example' } as NodeJS.ProcessEnv), /origin_invalid/)
})

test('reference Agent Card contains A2A 0.3 required implementation version and capabilities', () => {
  const card = referenceDiagnosticAgentCard({ VERCEL_URL: 'trusted.example.vercel.app' } as NodeJS.ProcessEnv)
  assert.equal(card.protocolVersion, '0.3.0')
  assert.equal(card.version, '1.0.0')
  assert.deepEqual(card.capabilities, { streaming: false, pushNotifications: false })
  assert.equal(card.url, 'https://trusted.example.vercel.app/api/a2a/reference-diagnostic')
  assert.equal(card.skills[0]?.id, REFERENCE_DIAGNOSTIC_SKILL_ID)
})
