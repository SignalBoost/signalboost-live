import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import {
  artifactVin, canonicalBirthBytes, issuerKeyFingerprint, verifyBirthIdentity,
  type BirthIdentity, type SignedBirthIdentity,
} from '../lib/ai/cos/universityArtifactBirthVerification.ts'

const identity: BirthIdentity = {
  permanentArtifactId: 'f2cb6434-a7ac-49ee-88f0-34a94f31a422',
  trainedArtifactHash: 'a'.repeat(64),
  revisionKey: 'b'.repeat(64),
  datasetHash: 'c'.repeat(64),
  parentPermanentArtifactId: null,
}
const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const issuerPublicKeyPem = publicKey.export({ format: 'pem', type: 'spki' }).toString()
const issuer = issuerKeyFingerprint(issuerPublicKeyPem)!
function certificate(payload: BirthIdentity = identity): SignedBirthIdentity {
  const bytes = canonicalBirthBytes(payload)!
  return { payload, algorithm: 'ed25519', issuerPublicKeyPem,
    signatureBase64: sign(null, bytes, privateKey).toString('base64') }
}

test('Phase 2: a pinned issuer independently verifies the immutable birth fields', () => {
  const result = verifyBirthIdentity(certificate(), identity.trainedArtifactHash, issuer)
  assert.deepEqual(result, { valid: true, vin: artifactVin(identity), reason: 'verified' })
  assert.match(result.vin!, /^AI-[0-9a-f]{64}$/)
})
test('Phase 2: case normalization is deterministic without losing hash or parent identity', () => {
  assert.equal(artifactVin({ ...identity, permanentArtifactId: identity.permanentArtifactId.toUpperCase(),
    trainedArtifactHash: identity.trainedArtifactHash.toUpperCase() }), artifactVin(identity))
  assert.notEqual(artifactVin({ ...identity, parentPermanentArtifactId: identity.permanentArtifactId }), artifactVin(identity))
})
test('Phase 2: altered artifact bytes, dataset, revision and parent cannot reuse a certificate', () => {
  const original = certificate()
  assert.equal(verifyBirthIdentity(original, 'd'.repeat(64), issuer).reason, 'artifact_mismatch')
  for (const altered of [
    { ...identity, datasetHash: 'd'.repeat(64) },
    { ...identity, revisionKey: 'e'.repeat(64) },
    { ...identity, parentPermanentArtifactId: identity.permanentArtifactId },
    { ...identity, trainedArtifactHash: 'f'.repeat(64) },
  ]) {
    assert.equal(verifyBirthIdentity({ ...original, payload: altered }, altered.trainedArtifactHash, issuer).reason, 'invalid_signature')
  }
})
test('Phase 2: attacker-controlled issuer key cannot replace trusted issuer', () => {
  const { privateKey: roguePrivate, publicKey: roguePublic } = generateKeyPairSync('ed25519')
  const roguePem = roguePublic.export({ format: 'pem', type: 'spki' }).toString()
  const rogue: SignedBirthIdentity = {
    payload: identity, issuerPublicKeyPem: roguePem, algorithm: 'ed25519',
    signatureBase64: sign(null, canonicalBirthBytes(identity)!, roguePrivate).toString('base64'),
  }
  assert.equal(verifyBirthIdentity(rogue, identity.trainedArtifactHash, issuer).reason, 'untrusted_issuer')
  assert.equal(verifyBirthIdentity(certificate(), identity.trainedArtifactHash, '0'.repeat(64)).reason, 'untrusted_issuer')
})
test('Phase 2: invalid identity, algorithm, signature and signature encoding fail closed', () => {
  assert.equal(artifactVin({ ...identity, trainedArtifactHash: 'oops' }), null)
  assert.equal(verifyBirthIdentity({ ...certificate(), algorithm: 'rsa' as 'ed25519' }, identity.trainedArtifactHash, issuer).reason, 'invalid_identity')
  assert.equal(verifyBirthIdentity({ ...certificate(), signatureBase64: 'AAAA' }, identity.trainedArtifactHash, issuer).reason, 'invalid_signature')
  assert.equal(verifyBirthIdentity({ ...certificate(), signatureBase64: 'not base64!' }, identity.trainedArtifactHash, issuer).reason, 'invalid_signature')
})
test('Phase 2: birth signature verifies identity only, never grants certification or tenant access', () => {
  const result = verifyBirthIdentity(certificate(), identity.trainedArtifactHash, issuer)
  assert.equal(result.valid, true)
  assert.equal(Object.hasOwn(result, 'graduated'), false)
  assert.equal(Object.hasOwn(result, 'authority'), false)
  assert.equal(Object.hasOwn(result, 'tenant'), false)
})
