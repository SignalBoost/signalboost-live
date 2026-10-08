// Phase 2 foundation: independently verifiable artifact birth identity.
// This module grants no training, graduation, registry, or Production authority.
import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto'

const DOMAIN = 'itmounts-artifact-birth-v1'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/i
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export type BirthIdentity = Readonly<{
  permanentArtifactId: string
  trainedArtifactHash: string
  revisionKey: string
  datasetHash: string
  parentPermanentArtifactId: string | null
}>

export type SignedBirthIdentity = Readonly<{
  payload: BirthIdentity
  signatureBase64: string
  issuerPublicKeyPem: string
  algorithm: 'ed25519'
}>

function normalized(input: BirthIdentity): BirthIdentity | null {
  if (!input || !UUID.test(input.permanentArtifactId)
    || !SHA256.test(input.trainedArtifactHash)
    || !SHA256.test(input.revisionKey)
    || !SHA256.test(input.datasetHash)
    || (input.parentPermanentArtifactId !== null && !UUID.test(input.parentPermanentArtifactId))) return null
  return {
    permanentArtifactId: input.permanentArtifactId.toLowerCase(),
    trainedArtifactHash: input.trainedArtifactHash.toLowerCase(),
    revisionKey: input.revisionKey.toLowerCase(),
    datasetHash: input.datasetHash.toLowerCase(),
    parentPermanentArtifactId: input.parentPermanentArtifactId?.toLowerCase() ?? null,
  }
}

/** Canonical, versioned, domain-separated bytes. No arbitrary object fields are serialized. */
export function canonicalBirthBytes(input: BirthIdentity): Buffer | null {
  const identity = normalized(input)
  if (!identity) return null
  return Buffer.from(JSON.stringify([
    DOMAIN,
    identity.permanentArtifactId,
    identity.trainedArtifactHash,
    identity.revisionKey,
    identity.datasetHash,
    identity.parentPermanentArtifactId,
  ]), 'utf8')
}

/** Deterministic display label, not a replacement for permanentArtifactId. */
export function artifactVin(input: BirthIdentity): string | null {
  const bytes = canonicalBirthBytes(input)
  return bytes ? 'AI-' + createHash('sha256').update(bytes).digest('hex') : null
}

export function issuerKeyFingerprint(issuerPublicKeyPem: string): string | null {
  try {
    const key = createPublicKey(issuerPublicKeyPem)
    if (key.asymmetricKeyType !== 'ed25519') return null
    return createHash('sha256').update(key.export({ format: 'der', type: 'spki' })).digest('hex')
  } catch { return null }
}

export type BirthVerificationResult = Readonly<{
  valid: boolean
  vin: string | null
  reason: 'verified' | 'invalid_identity' | 'artifact_mismatch' | 'untrusted_issuer' | 'invalid_signature'
}>

/**
 * A signature is never proof of competence. The verifier requires an externally pinned issuer
 * fingerprint, exact artifact hash, valid Ed25519 signature, and immutable birth fields.
 * Caller owns tenant authorization, trusted issuer configuration, and certificate provenance.
 */
export function verifyBirthIdentity(
  certificate: SignedBirthIdentity,
  observedArtifactHash: string,
  trustedIssuerFingerprint: string,
): BirthVerificationResult {
  const bytes = canonicalBirthBytes(certificate?.payload)
  if (!bytes || certificate.algorithm !== 'ed25519') return { valid: false, vin: null, reason: 'invalid_identity' }
  const vin = artifactVin(certificate.payload)
  if (!SHA256.test(observedArtifactHash)
    || certificate.payload.trainedArtifactHash.toLowerCase() !== observedArtifactHash.toLowerCase()) {
    return { valid: false, vin, reason: 'artifact_mismatch' }
  }
  const fingerprint = issuerKeyFingerprint(certificate.issuerPublicKeyPem)
  if (!fingerprint || !SHA256.test(trustedIssuerFingerprint)
    || !timingSafeEqual(Buffer.from(fingerprint, 'hex'), Buffer.from(trustedIssuerFingerprint, 'hex'))) {
    return { valid: false, vin, reason: 'untrusted_issuer' }
  }
  try {
    if (!BASE64.test(certificate.signatureBase64)) return { valid: false, vin, reason: 'invalid_signature' }
    const signature = Buffer.from(certificate.signatureBase64, 'base64')
    if (signature.length !== 64 || !verify(null, bytes, createPublicKey(certificate.issuerPublicKeyPem), signature)) {
      return { valid: false, vin, reason: 'invalid_signature' }
    }
    return { valid: true, vin, reason: 'verified' }
  } catch {
    return { valid: false, vin, reason: 'invalid_signature' }
  }
}
