import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import test from 'node:test'
import { auditStoredBirthCertificate } from '../lib/ai/cos/universityStoredBirthAudit.ts'
import { artifactVin, canonicalBirthBytes, issuerKeyFingerprint } from '../lib/ai/cos/universityArtifactBirthVerification.ts'

const birth = {
  permanent_artifact_id: 'f2cb6434-a7ac-49ee-88f0-34a94f31a422',
  trained_artifact_hash: 'a'.repeat(64),
  revision_key: 'b'.repeat(64), dataset_hash: 'c'.repeat(64),
  parent_permanent_artifact_id: null, issuance_kind: 'native_birth',
}
const payload = {
  permanentArtifactId: birth.permanent_artifact_id, trainedArtifactHash: birth.trained_artifact_hash,
  revisionKey: birth.revision_key, datasetHash: birth.dataset_hash, parentPermanentArtifactId: null,
}
const keypair = generateKeyPairSync('ed25519')
const pem = keypair.publicKey.export({ type: 'spki', format: 'pem' }).toString()
const pin = issuerKeyFingerprint(pem)!
const stored = {
  permanent_artifact_id: birth.permanent_artifact_id,
  trained_artifact_hash: birth.trained_artifact_hash,
  revision_key: birth.revision_key, dataset_hash: birth.dataset_hash,
  parent_permanent_artifact_id: null,
  vin: artifactVin(payload)!, algorithm: 'ed25519' as const,
  signature_base64: sign(null, canonicalBirthBytes(payload)!, keypair.privateKey).toString('base64'),
  issuer_public_key_pem: pem, issuer_fingerprint: pin,
}
test('Phase 2: independent auditor verifies persisted signed birth', () => {
  assert.equal(auditStoredBirthCertificate({ birth, stored, trustedIssuerFingerprint: pin }), 'verified')
})
test('Phase 2: absent, legacy, or mismatched authoritative birth fails closed', () => {
  assert.equal(auditStoredBirthCertificate({ birth: null, stored, trustedIssuerFingerprint: pin }), 'missing_birth')
  assert.equal(auditStoredBirthCertificate({ birth, stored: null, trustedIssuerFingerprint: pin }), 'missing_certificate')
  assert.equal(auditStoredBirthCertificate({ birth: { ...birth, issuance_kind: 'legacy_backfill' }, stored, trustedIssuerFingerprint: pin }), 'missing_birth')
  assert.equal(auditStoredBirthCertificate({ birth: { ...birth, dataset_hash: 'd'.repeat(64) }, stored, trustedIssuerFingerprint: pin }), 'birth_mismatch')
})
test('Phase 2: corrupted VIN, revision, signature and issuer pins are rejected', () => {
  for (const altered of [
    { ...stored, vin: 'AI-' + '0'.repeat(64) },
    { ...stored, revision_key: '0'.repeat(64) },
  ]) assert.equal(auditStoredBirthCertificate({ birth, stored: altered, trustedIssuerFingerprint: pin }), 'birth_mismatch')
  assert.equal(auditStoredBirthCertificate({ birth, stored: { ...stored, signature_base64: 'AAAA' }, trustedIssuerFingerprint: pin }), 'invalid_signature')
  assert.equal(auditStoredBirthCertificate({ birth, stored, trustedIssuerFingerprint: '0'.repeat(64) }), 'untrusted_issuer')
})
test('Phase 2: issuer substitution is rejected even with valid-looking stored metadata', () => {
  const rogue = generateKeyPairSync('ed25519')
  const roguePem = rogue.publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const altered = { ...stored, issuer_public_key_pem: roguePem, issuer_fingerprint: issuerKeyFingerprint(roguePem)! }
  assert.equal(auditStoredBirthCertificate({ birth, stored: altered, trustedIssuerFingerprint: pin }), 'untrusted_issuer')
})
