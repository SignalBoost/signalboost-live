import assert from 'node:assert/strict'
import test from 'node:test'
import { createHash } from 'node:crypto'
import { deliverVerifiedCustomerArtifact } from '../lib/ai/cos/labCustomerArtifactVerifiedDelivery.ts'

const org = '11111111-1111-4111-8111-111111111111'
const other = '33333333-3333-4333-8333-333333333333'
const artifact = '22222222-2222-4222-8222-222222222222'
const bytes = new TextEncoder().encode('example model adapter bytes')
const hash = createHash('sha256').update(bytes).digest('hex')
const request = { authenticatedUserId: 'user', requestedOrganizationId: org, requestedArtifactId: artifact }
const evidence = {
  organizationId: org, artifactId: artifact, requestingUserId: 'user',
  activeMember: true, executionAuthorityVerified: true,
  artifactReady: true, storedSha256: hash, storageTenantId: org,
}
const resolver = async () => ({ evidence, readBytes: async () => bytes })

test('returns verified bytes without requiring graduation or model certification', async () => {
  const result = await deliverVerifiedCustomerArtifact(request, resolver)
  assert.equal(result.ok, true)
  if (result.ok) { assert.deepEqual(result.bytes, bytes); assert.equal(result.sha256, hash) }
})
test('unauthenticated access never resolves storage', async () => {
  let calls = 0
  const result = await deliverVerifiedCustomerArtifact({ ...request, authenticatedUserId: null }, async () => {
    calls++; return resolver()
  })
  assert.equal(result.ok, false)
  assert.equal(calls, 0)
})
test('cross-tenant storage is rejected before bytes are read', async () => {
  let reads = 0
  const result = await deliverVerifiedCustomerArtifact(request, async () => ({
    evidence: { ...evidence, storageTenantId: other },
    readBytes: async () => { reads++; return bytes },
  }))
  assert.deepEqual(result, { ok: false, reason: 'ownership_mismatch' })
  assert.equal(reads, 0)
})
test('revoked execution authority refuses download before storage reads', async () => {
  let reads = 0
  const result = await deliverVerifiedCustomerArtifact(request, async () => ({
    evidence: { ...evidence, executionAuthorityVerified: false },
    readBytes: async () => { reads++; return bytes },
  }))
  assert.deepEqual(result, { ok: false, reason: 'unauthorized' })
  assert.equal(reads, 0)
})
test('tampered bytes never leave the boundary', async () => {
  const result = await deliverVerifiedCustomerArtifact(request, async () => ({
    evidence, readBytes: async () => new TextEncoder().encode('tampered'),
  }))
  assert.deepEqual(result, { ok: false, reason: 'integrity_failed' })
})
test('missing, unready, and oversized artifacts fail closed', async () => {
  assert.equal((await deliverVerifiedCustomerArtifact(request, async () => ({
    evidence: { ...evidence, artifactReady: false },
    readBytes: async () => bytes,
  }))).ok, false)
  assert.equal((await deliverVerifiedCustomerArtifact(request, async () => ({
    evidence, readBytes: async () => null,
  }))).ok, false)
  assert.equal((await deliverVerifiedCustomerArtifact(request, async () => ({
    evidence, readBytes: async () => new Uint8Array(32 * 1024 * 1024 + 1),
  }))).ok, false)
})
