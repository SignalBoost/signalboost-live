import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { canonicalBirthBytes, issuerKeyFingerprint, type SignedBirthIdentity } from '../lib/ai/cos/universityArtifactBirthVerification.ts'
import { verifySignedArtifactBytes } from '../lib/ai/cos/universitySignedArtifactByteIntegrity.ts'

const bytes = Buffer.from('actual immutable weights and metadata bytes')
const hash = createHash('sha256').update(bytes).digest('hex')
const keys = generateKeyPairSync('ed25519')
const pem = keys.publicKey.export({ format: 'pem', type: 'spki' }).toString()
const pin = issuerKeyFingerprint(pem)!
const payload = { permanentArtifactId: 'f2cb6434-a7ac-49ee-88f0-34a94f31a422',
  trainedArtifactHash: hash, revisionKey: 'b'.repeat(64),
  datasetHash: 'c'.repeat(64), parentPermanentArtifactId: null }
const cert: SignedBirthIdentity = { payload, algorithm: 'ed25519', issuerPublicKeyPem: pem,
  signatureBase64: sign(null, canonicalBirthBytes(payload)!, keys.privateKey).toString('base64') }
async function *chunks(input: Uint8Array) { yield input.subarray(0, 11); yield input.subarray(11) }
test('Phase 2 exact artifact verification streams and hashes bytes', async () => {
  const result = await verifySignedArtifactBytes({ certificate: cert, trustedIssuerFingerprint: pin, bytes: chunks(bytes), maxBytes: 1024 })
  assert.deepEqual(result, { verified: true, reason: 'verified', observedSha256: hash })
})
test('Phase 2 corrupted artifact bytes fail despite valid signed metadata', async () => {
  const result = await verifySignedArtifactBytes({ certificate: cert, trustedIssuerFingerprint: pin, bytes: chunks(Buffer.from('corrupted bytes')), maxBytes: 1024 })
  assert.equal(result.reason, 'artifact_bytes_mismatch')
  assert.equal(result.verified, false)
})
test('Phase 2 wrong issuer or signature fails before any bytes are read', async () => {
  let reads = 0
  async function *observed() { reads++; yield bytes }
  for (const input of [
    { certificate: cert, trustedIssuerFingerprint: '0'.repeat(64) },
    { certificate: { ...cert, signatureBase64: 'AAAA' }, trustedIssuerFingerprint: pin },
  ]) {
    assert.equal((await verifySignedArtifactBytes({ ...input, bytes: observed(), maxBytes: 1024 })).reason, 'invalid_certificate')
  }
  assert.equal(reads, 0)
})
test('Phase 2 oversized byte stream refuses integrity proof', async () => {
  assert.equal((await verifySignedArtifactBytes({ certificate: cert, trustedIssuerFingerprint: pin, bytes: chunks(bytes), maxBytes: 12 })).reason, 'size_limit')
})
test('Phase 2 storage errors do not prove integrity', async () => {
  async function *broken(): AsyncGenerator<Uint8Array> { throw Error('storage failed') }
  assert.equal((await verifySignedArtifactBytes({ certificate: cert, trustedIssuerFingerprint: pin, bytes: broken(), maxBytes: 1024 })).reason, 'read_failure')
})
