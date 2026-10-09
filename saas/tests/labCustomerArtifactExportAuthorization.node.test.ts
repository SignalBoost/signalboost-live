import assert from 'node:assert/strict'
import test from 'node:test'
import { authorizeCustomerArtifactExport } from '../lib/ai/cos/labCustomerArtifactExportAuthorization.ts'

const org = '11111111-1111-4111-8111-111111111111'
const otherOrg = '33333333-3333-4333-8333-333333333333'
const artifact = '22222222-2222-4222-8222-222222222222'
const digest = 'a'.repeat(64)
const req = { authenticatedUserId: 'signed-in-user', requestedOrganizationId: org, requestedArtifactId: artifact }
const proof = {
  organizationId: org, artifactId: artifact, requestingUserId: 'signed-in-user',
  activeMember: true, executionAuthorityVerified: true,
  storageObjectVerified: true, artifactReady: true,
  storedSha256: digest, independentlyComputedSha256: digest,
  storageTenantId: org,
}

test('customer artifact is eligible without graduation or external model certification', () => {
  assert.deepEqual(authorizeCustomerArtifactExport(req, proof),
    { allowed: true, artifactId: artifact, organizationId: org, sha256: digest })
})
test('anonymous and unauthorized membership or execution are denied', () => {
  assert.equal(authorizeCustomerArtifactExport({ ...req, authenticatedUserId: null }, proof).allowed, false)
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, activeMember: false }).allowed, false)
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, executionAuthorityVerified: false }).allowed, false)
  assert.equal(authorizeCustomerArtifactExport(req, null).allowed, false)
})
test('foreign tenant, storage tenant, and artifact mismatch are denied', () => {
  assert.equal(authorizeCustomerArtifactExport({ ...req, requestedOrganizationId: otherOrg }, proof).allowed, false)
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, storageTenantId: otherOrg }).allowed, false)
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, artifactId: otherOrg }).allowed, false)
})
test('incomplete artifact and missing stored bytes are denied', () => {
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, artifactReady: false }).allowed, false)
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, storageObjectVerified: false }).allowed, false)
})
test('tampering and invalid digest are denied', () => {
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, independentlyComputedSha256: 'b'.repeat(64) }).allowed, false)
  assert.equal(authorizeCustomerArtifactExport(req, { ...proof, storedSha256: 'not-a-hash' }).allowed, false)
})
