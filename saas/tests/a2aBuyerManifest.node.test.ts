import assert from 'node:assert/strict'
import test from 'node:test'
import { A2A_BUYER_MANIFEST_VERSION, dryRunBuyerA2AOnboarding, validateBuyerA2AOnboardingManifest } from '../a2a-host/a2a-buyer-manifest.ts'

const agentCard = {
  protocolVersion: '0.3.0',
  name: 'Buyer Diagnostic Agent',
  description: 'Buyer-owned read-only diagnostic specialist',
  url: 'https://buyer.example/a2a',
  preferredTransport: 'JSONRPC',
  defaultInputModes: ['text/plain'],
  defaultOutputModes: ['application/json'],
  skills: [{ id: 'self-healing.diagnose', name: 'Diagnose', description: 'Diagnose incidents', tags: ['diagnostic'] }],
}

function manifest() {
  return {
    schemaVersion: A2A_BUYER_MANIFEST_VERSION,
    agentId: 'buyer-diagnostic-1',
    transportRef: 'buyer-diagnostic-runtime',
    assignmentId: 'buyer-diagnostic-assignment-1',
    tenantId: 'tenant-1',
    environmentId: 'prod',
    portableId: 'self-healing-supervisor',
    approvedSkills: [{ skillId: 'self-healing.diagnose', risk: 'advisory' as const }],
  }
}

test('Phase 12 dry run produces a safe buyer-ready install plan without activation', async () => {
  let healthReads = 0
  const result = await dryRunBuyerA2AOnboarding({
    manifest: manifest(),
    agentCard,
    fetchAgentCardForHealth: async () => { healthReads += 1; return agentCard },
  })
  assert.equal(result.status, 'buyer-ready')
  assert.equal(result.mode, 'dry-run')
  assert.equal(result.agent.agentId, 'buyer-diagnostic-1')
  assert.equal(result.assignment.portableId, 'self-healing-supervisor')
  assert.equal(healthReads, 1)
  const serialized = JSON.stringify(result)
  assert.ok(!serialized.includes('buyer.example'))
  assert.ok(!serialized.includes('Authorization'))
})

test('Phase 12 rejects wildcard scope', () => {
  const value = { ...manifest(), tenantId: '*' }
  assert.throws(() => validateBuyerA2AOnboardingManifest(value), /does not allow wildcard scope/)
})

test('Phase 12 rejects secret-like and endpoint fields recursively', () => {
  assert.throws(() => validateBuyerA2AOnboardingManifest({ ...manifest(), apiKey: 'secret' }), /unknown_field|secret_or_endpoint/)
  assert.throws(() => validateBuyerA2AOnboardingManifest({ ...manifest(), approvedSkills: [{ skillId: 'self-healing.diagnose', risk: 'advisory', token: 'secret' }] }), /skill_unknown_field|secret_or_endpoint/)
})

test('Phase 12 rejects unknown top-level fields', () => {
  assert.throws(() => validateBuyerA2AOnboardingManifest({ ...manifest(), extra: true }), /a2a_buyer_manifest_unknown_field:extra/)
})

test('Phase 12 keeps Agent Card endpoint outside the portable manifest', () => {
  const serialized = JSON.stringify(manifest())
  assert.ok(!serialized.includes('https://'))
  assert.ok(!serialized.includes('url'))
  assert.ok(!serialized.includes('endpoint'))
})
