import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyTrustedBirthGrant, BIRTH_ISSUE_CAPABILITY } from '../lib/ai/cos/universityBirthHarnessGrant.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'

const id = 'f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const grant = { approved: true, harnessRunId: 'run1', tenantId: 'tenant1', permanentArtifactId: id }
const manifest: HarnessManifest = {
  runId: 'run1', objective: 'Issue birth certificate',
  identity: { agentId: 'issuer', role: 'certificate-issuer', tenantId: 'tenant1',
    artifact: { artifactId: id } },
  profile: 'production', environment: { environmentId: 'authorized-issuer', class: 'production' },
  authorityManifestRef: 'referee-approved-1',
  capabilities: [{ id: BIRTH_ISSUE_CAPABILITY, environments: ['production'],
    mutating: true, risk: 'consequential', scopes: [id] }],
  limits: { maxToolCalls: 1 }, learningFeedbackAllowed: false,
}
const trusted = async () => ({ manifest, status: 'active' as const, authorityVerified: true })

test('Phase 2: exact tenant artifact run and consequential capability pass', async () => {
  assert.equal(await verifyTrustedBirthGrant(grant, trusted), true)
})
test('Phase 2: untrusted grant, wrong tenant, wrong artifact or run fail closed', async () => {
  for (const g of [
    { ...grant, approved: false },
    { ...grant, tenantId: 'other-tenant' },
    { ...grant, permanentArtifactId: 'other-artifact' },
    { ...grant, harnessRunId: 'another-run' },
  ]) assert.equal(await verifyTrustedBirthGrant(g, trusted), false)
})
test('Phase 2: absent or insufficient authority cannot sign', async () => {
  for (const altered of [
    { ...manifest, capabilities: [] },
    { ...manifest, capabilities: [{ ...manifest.capabilities[0], risk: 'read' as const }] },
    { ...manifest, capabilities: [{ ...manifest.capabilities[0], scopes: ['other-artifact'] }] },
    { ...manifest, capabilities: [{ ...manifest.capabilities[0], mutating: false }] },
    { ...manifest, profile: 'residency' as const },
    { ...manifest, environment: { environmentId: 'x', class: 'sandbox' as const } },
    { ...manifest, deadlineAt: '2000-01-01T00:00:00Z' },
    { ...manifest, authorityManifestRef: '' },
  ]) assert.equal(await verifyTrustedBirthGrant(grant, async () => ({ manifest: altered, status: 'active' as const, authorityVerified: true })), false)
})
test('Phase 2: expired or completed runs and unverified authority cannot sign', async () => {
  for (const status of ['completed', 'failed', 'cancelled'] as const) {
    assert.equal(await verifyTrustedBirthGrant(grant, async () => ({ manifest, status, authorityVerified: true })), false)
  }
  assert.equal(await verifyTrustedBirthGrant(grant, async () => ({ manifest, status: 'active', authorityVerified: false })), false)
})
test('Phase 2: missing durable authority or resolver failure cannot sign', async () => {
  assert.equal(await verifyTrustedBirthGrant(grant, async () => null), false)
  assert.equal(await verifyTrustedBirthGrant(grant, async () => { throw Error('unavailable') }), false)
})
