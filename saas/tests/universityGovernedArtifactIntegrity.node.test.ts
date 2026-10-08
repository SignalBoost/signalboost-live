import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { canonicalBirthBytes, issuerKeyFingerprint, type SignedBirthIdentity } from '../lib/ai/cos/universityArtifactBirthVerification.ts'
import { ARTIFACT_INTEGRITY_READ_CAPABILITY, verifyGovernedArtifactIntegrity } from '../lib/ai/cos/universityGovernedArtifactIntegrity.ts'
import type { HarnessManifest } from '../platform-harness/core/types.ts'

const bytes = Buffer.from('specific immutable trained artifact')
const sha = createHash('sha256').update(bytes).digest('hex')
const id = 'f2cb6434-a7ac-49ee-88f0-34a94f31a422'
const pair = generateKeyPairSync('ed25519')
const pem = pair.publicKey.export({ format: 'pem', type: 'spki' }).toString()
const pin = issuerKeyFingerprint(pem)!
const payload = { permanentArtifactId: id, trainedArtifactHash: sha, revisionKey: 'b'.repeat(64), datasetHash: 'c'.repeat(64), parentPermanentArtifactId: null }
const certificate: SignedBirthIdentity = { payload, algorithm: 'ed25519', issuerPublicKeyPem: pem, signatureBase64: sign(null, canonicalBirthBytes(payload)!, pair.privateKey).toString('base64') }
const manifest: HarnessManifest = {
  runId: 'run-1', objective: 'verify artifact integrity',
  identity: { agentId: 'verifier', role: 'verifier', tenantId: 'tenant-A', artifact: { artifactId: id } },
  profile: 'production', environment: { environmentId: 'prod-1', class: 'production' },
  authorityManifestRef: 'guardian-authority-1',
  capabilities: [{ id: ARTIFACT_INTEGRITY_READ_CAPABILITY, risk: 'read', mutating: false, environments: ['production'], scopes: [id] }],
  limits: {}, learningFeedbackAllowed: false,
}
function scenario(opts: { tenantId?: string; trust?: boolean; badBytes?: boolean; tamperedCert?: boolean; revoke?: boolean } = {}) {
  let reads = 0
  let checks = 0
  const input = {
    tenantId: opts.tenantId ?? 'tenant-A', harnessRunId: 'run-1',
    certificate: opts.tamperedCert ? { ...certificate, signatureBase64: 'AA==' } : certificate,
    trustedIssuerFingerprint: pin, maxBytes: 1024,
    resolveTrustedRun: async () => {
      checks++
      return { manifest, status: 'active' as const, authorityVerified: opts.trust !== false && (!opts.revoke || checks === 1) }
    },
    openArtifactBytes: async () => { reads++; return (async function* () { yield opts.badBytes ? Buffer.from('tampered') : bytes })() },
  }
  return { input, reads: () => reads, checks: () => checks }
}
test('authorized exact artifact stream verifies with full SHA256', async () => {
  const s = scenario()
  assert.deepEqual(await verifyGovernedArtifactIntegrity(s.input), { verified: true, reason: 'verified', observedSha256: sha })
  assert.equal(s.reads(), 1)
  assert.equal(s.checks(), 2)
})
test('foreign tenant and missing durable authority never open bytes', async () => {
  for (const opts of [{ tenantId: 'tenant-B' }, { trust: false }]) {
    const s = scenario(opts)
    assert.equal((await verifyGovernedArtifactIntegrity(s.input)).reason, 'unauthorized')
    assert.equal(s.reads(), 0)
  }
})
test('invalid signature never opens tenant-private artifact bytes', async () => {
  const s = scenario({ tamperedCert: true })
  assert.equal((await verifyGovernedArtifactIntegrity(s.input)).reason, 'invalid_certificate')
  assert.equal(s.reads(), 0)
})
test('tampered actual artifact bytes cannot yield verified integrity', async () => {
  const s = scenario({ badBytes: true })
  assert.equal((await verifyGovernedArtifactIntegrity(s.input)).reason, 'artifact_bytes_mismatch')
})
test('revocation while streaming fails closed even with the exact bytes', async () => {
  const s = scenario({ revoke: true })
  assert.equal((await verifyGovernedArtifactIntegrity(s.input)).reason, 'unauthorized')
  assert.equal(s.reads(), 1)
})
