// Phase 2: map a DB birth row into the independently verifiable certificate envelope.
// This module does not own keys, mint authority, write DB rows or activate any artifact.
import { createPublicKey, verify } from 'node:crypto'
import {
  canonicalBirthBytes, issuerKeyFingerprint, verifyBirthIdentity,
  type BirthIdentity, type SignedBirthIdentity,
} from './universityArtifactBirthVerification.ts'

export type BirthRecord = Readonly<{
  permanent_artifact_id: unknown
  trained_artifact_hash: unknown
  revision_key: unknown
  dataset_hash: unknown
  parent_permanent_artifact_id: unknown
  issuance_kind: unknown
}>

/** Historical backfills and rows lacking signed provenance are never silently upgraded. */
export function nativeBirthIdentity(row: BirthRecord): BirthIdentity | null {
  if (!row || row.issuance_kind !== 'native_birth' || typeof row.permanent_artifact_id !== 'string'
    || typeof row.trained_artifact_hash !== 'string' || typeof row.revision_key !== 'string'
    || typeof row.dataset_hash !== 'string'
    || (row.parent_permanent_artifact_id !== null && typeof row.parent_permanent_artifact_id !== 'string')) return null
  const identity: BirthIdentity = {
    permanentArtifactId: row.permanent_artifact_id,
    trainedArtifactHash: row.trained_artifact_hash,
    revisionKey: row.revision_key,
    datasetHash: row.dataset_hash,
    parentPermanentArtifactId: typeof row.parent_permanent_artifact_id === 'string' ? row.parent_permanent_artifact_id : null,
  }
  return canonicalBirthBytes(identity) ? identity : null
}

export type DetachedBirthSigner = (canonicalPayload: Uint8Array) => Promise<Uint8Array>

/**
 * This only constructs a certificate after an authorized, externally managed signer has run.
 * The caller MUST enforce tenant authorization and authorize the signing operation through
 * the Platform Harness; never accept signing keys or trusted issuer pins from an artifact.
 * Re-verify the produced signature before returning; signer mistakes fail closed.
 */
export async function signNativeBirthRecord(
  row: BirthRecord,
  signer: DetachedBirthSigner,
  issuerPublicKeyPem: string,
  trustedIssuerFingerprint: string,
): Promise<SignedBirthIdentity | null> {
  const identity = nativeBirthIdentity(row)
  if (!identity) return null
  const bytes = canonicalBirthBytes(identity)
  if (!bytes || typeof signer !== 'function') return null
  const fp = issuerKeyFingerprint(issuerPublicKeyPem)
  if (!fp || fp !== trustedIssuerFingerprint.toLowerCase()) return null
  try {
    const key = createPublicKey(issuerPublicKeyPem)
    const signature = await signer(bytes)
    if (!(signature instanceof Uint8Array) || signature.length !== 64
      || !verify(null, bytes, key, signature)) return null
    const envelope: SignedBirthIdentity = {
      payload: identity,
      signatureBase64: Buffer.from(signature).toString('base64'),
      issuerPublicKeyPem,
      algorithm: 'ed25519',
    }
    return verifyBirthIdentity(envelope, identity.trainedArtifactHash, trustedIssuerFingerprint).valid ? envelope : null
  } catch { return null }
}
