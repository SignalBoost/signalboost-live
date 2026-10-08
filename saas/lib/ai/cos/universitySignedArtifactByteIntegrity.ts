// Phase 2: exact-artifact integrity is a byte-level proof, not a metadata claim.
// Storage access/tenant authorization MUST be independently enforced by the caller.
import { createHash, timingSafeEqual } from 'node:crypto'
import { verifyBirthIdentity, type SignedBirthIdentity } from './universityArtifactBirthVerification.ts'

const SHA256 = /^[a-f0-9]{64}$/i

/** Stream exact artifact bytes from a trusted content store, with a hard maximum size. */
export async function verifySignedArtifactBytes(input: Readonly<{
  certificate: SignedBirthIdentity
  trustedIssuerFingerprint: string
  bytes: AsyncIterable<Uint8Array>
  maxBytes: number
}>): Promise<Readonly<{
  verified: boolean
  reason: 'verified' | 'invalid_certificate' | 'artifact_bytes_mismatch' | 'size_limit' | 'read_failure'
  observedSha256: string | null
}>> {
  const expected = input.certificate?.payload?.trainedArtifactHash
  if (!expected || !SHA256.test(expected) || !Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0
    || !input.bytes || typeof input.bytes[Symbol.asyncIterator] !== 'function') {
    return { verified: false, reason: 'invalid_certificate', observedSha256: null }
  }
  // Reject invalid issuers and malformed signatures before consuming confidential artifact bytes.
  if (!verifyBirthIdentity(input.certificate, expected, input.trustedIssuerFingerprint).valid) {
    return { verified: false, reason: 'invalid_certificate', observedSha256: null }
  }
  let size = 0
  const hash = createHash('sha256')
  try {
    for await (const chunk of input.bytes) {
      if (!(chunk instanceof Uint8Array)) return { verified: false, reason: 'read_failure', observedSha256: null }
      size += chunk.byteLength
      if (!Number.isSafeInteger(size) || size > input.maxBytes) {
        return { verified: false, reason: 'size_limit', observedSha256: null }
      }
      hash.update(chunk)
    }
    const observed = hash.digest('hex')
    if (!timingSafeEqual(Buffer.from(observed, 'hex'), Buffer.from(expected, 'hex'))) {
      return { verified: false, reason: 'artifact_bytes_mismatch', observedSha256: observed }
    }
    return { verified: true, reason: 'verified', observedSha256: observed }
  } catch {
    return { verified: false, reason: 'read_failure', observedSha256: null }
  }
}
