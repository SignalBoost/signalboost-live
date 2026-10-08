// Phase 2: trusted-server adapter only. Never expose this as a public endpoint.
// Authorization/Harness approval and immutable tenant-scoped birth lookup are external prerequisites.
import { artifactVin, issuerKeyFingerprint, verifyBirthIdentity, type SignedBirthIdentity } from './universityArtifactBirthVerification.ts'
import { nativeBirthIdentity, type BirthRecord } from './universityBirthRecordSigningBoundary.ts'

export type SignedBirthStorageRow = Readonly<{
  permanent_artifact_id: string
  trained_artifact_hash: string
  revision_key: string
  dataset_hash: string
  parent_permanent_artifact_id: string | null
  vin: string
  algorithm: 'ed25519'
  signature_base64: string
  issuer_public_key_pem: string
  issuer_fingerprint: string
}>

export type VerifiedBirthStorage = Readonly<{
  /** Must be a tenant-filtered authoritative read, under a previously approved HarnessRun. */
  readNativeBirth: (id: string) => Promise<BirthRecord | null>
  /** Trusted service-role persistence only; DB insertion trigger independently checks birth fields. */
  insertOnce: (row: SignedBirthStorageRow) => Promise<boolean>
  readStored: (id: string) => Promise<SignedBirthStorageRow | null>
}>

export type VerifiedBirthPersistence = 'verified_persisted' | 'not_authorized' | 'birth_mismatch' | 'invalid_certificate' | 'storage_failed'

/** Caller cannot provide the issuer pin as artifact input: obtain it from tenant-owned trusted configuration. */
export async function persistVerifiedNativeBirth(input: Readonly<{
  certificate: SignedBirthIdentity
  trustedIssuerFingerprint: string
  /** Auth must prove the current tenant+artifact+HarnessRun is allowed to issue this certificate. */
  authorize: (permanentArtifactId: string) => Promise<boolean>
  storage: VerifiedBirthStorage
}>): Promise<VerifiedBirthPersistence> {
  const payload = input.certificate?.payload
  if (!payload || typeof payload.permanentArtifactId !== 'string') return 'invalid_certificate'
  try {
    if (!await input.authorize(payload.permanentArtifactId)) return 'not_authorized'
    const birth = await input.storage.readNativeBirth(payload.permanentArtifactId)
    const authoritative = birth && nativeBirthIdentity(birth)
    if (!authoritative || JSON.stringify(authoritative) !== JSON.stringify(payload)) return 'birth_mismatch'
    const verdict = verifyBirthIdentity(input.certificate, authoritative.trainedArtifactHash, input.trustedIssuerFingerprint)
    const vin = artifactVin(authoritative)
    const fingerprint = issuerKeyFingerprint(input.certificate.issuerPublicKeyPem)
    if (!verdict.valid || !vin || !fingerprint) return 'invalid_certificate'
    const row: SignedBirthStorageRow = {
      permanent_artifact_id: authoritative.permanentArtifactId,
      trained_artifact_hash: authoritative.trainedArtifactHash,
      revision_key: authoritative.revisionKey,
      dataset_hash: authoritative.datasetHash,
      parent_permanent_artifact_id: authoritative.parentPermanentArtifactId,
      vin, algorithm: 'ed25519',
      signature_base64: input.certificate.signatureBase64,
      issuer_public_key_pem: input.certificate.issuerPublicKeyPem,
      issuer_fingerprint: fingerprint,
    }
    if (!await input.storage.insertOnce(row)) return 'storage_failed'
    const persisted = await input.storage.readStored(authoritative.permanentArtifactId)
    if (!persisted || JSON.stringify(persisted) !== JSON.stringify(row)) return 'storage_failed'
    return 'verified_persisted'
  } catch { return 'storage_failed' }
}
