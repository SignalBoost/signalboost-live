// Phase 2: read-only audit of a stored artifact certificate.
// Database presence/field matching is NOT cryptographic verification or graduation.
import { artifactVin, issuerKeyFingerprint, verifyBirthIdentity, type SignedBirthIdentity } from './universityArtifactBirthVerification.ts'
import { nativeBirthIdentity, type BirthRecord } from './universityBirthRecordSigningBoundary.ts'
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

export type StoredBirthAudit = 'verified' | 'missing_birth' | 'missing_certificate'
  | 'birth_mismatch' | 'untrusted_issuer' | 'invalid_signature'

/**
 * Authoritative birth and stored row must be read under the SAME tenant authorization.
 * Caller must acquire issuer fingerprint from trusted, versioned configuration, never from row.
 */
export function auditStoredBirthCertificate(input: Readonly<{
  birth: BirthRecord | null
  stored: SignedBirthStorageRow | null
  trustedIssuerFingerprint: string
}>): StoredBirthAudit {
  const birth = input.birth && nativeBirthIdentity(input.birth)
  if (!birth) return 'missing_birth'
  const stored = input.stored
  if (!stored) return 'missing_certificate'
  const vin = artifactVin(birth)
  if (!vin || stored.permanent_artifact_id !== birth.permanentArtifactId
    || stored.trained_artifact_hash !== birth.trainedArtifactHash
    || stored.revision_key !== birth.revisionKey
    || stored.dataset_hash !== birth.datasetHash
    || stored.parent_permanent_artifact_id !== birth.parentPermanentArtifactId
    || stored.vin !== vin || stored.algorithm !== 'ed25519') return 'birth_mismatch'

  const fingerprint = issuerKeyFingerprint(stored.issuer_public_key_pem)
  if (!fingerprint || fingerprint !== stored.issuer_fingerprint
    || fingerprint !== input.trustedIssuerFingerprint.toLowerCase()) return 'untrusted_issuer'

  const certificate: SignedBirthIdentity = {
    payload: birth, signatureBase64: stored.signature_base64,
    issuerPublicKeyPem: stored.issuer_public_key_pem, algorithm: 'ed25519',
  }
  const result = verifyBirthIdentity(certificate, birth.trainedArtifactHash, input.trustedIssuerFingerprint)
  return result.valid ? 'verified' : result.reason === 'untrusted_issuer' ? 'untrusted_issuer' : 'invalid_signature'
}
