// Phase 2: bounded issuance composition for an already-authorized trusted Harness run.
// This is NOT an API, tenant authority issuer, or key-management service.
// The host must provide a trusted tenant-bound grant and an external HSM/KMS signing adapter.
import {
  signNativeBirthRecord, type BirthRecord, type DetachedBirthSigner,
} from './universityBirthRecordSigningBoundary.ts'
import {
  persistVerifiedNativeBirth, type VerifiedBirthStorage,
  type VerifiedBirthPersistence,
} from './universityVerifiedBirthPersistence.ts'

export type TrustedBirthIssuanceGrant = Readonly<{
  tenantId: string
  harnessRunId: string
  permanentArtifactId: string
  /** A trusted authorization check must bind all three values to the current operation. */
  approved: boolean
}>

export type BirthIssuanceOutcome =
  | VerifiedBirthPersistence
  | 'invalid_grant'
  | 'signer_failed'

/**
 * A caller may NOT derive grant.approved from an artifact request or model text.
 * Trusted verification is repeated before signing and before persistence; both fail closed.
 * No keys are accepted here. The injected signer must enforce its own grant/KMS authorization.
 */
export async function issueVerifiedNativeBirth(input: Readonly<{
  grant: TrustedBirthIssuanceGrant
  verifyGrant: (grant: TrustedBirthIssuanceGrant) => Promise<boolean>
  readNativeBirth: (tenantId: string, permanentArtifactId: string) => Promise<BirthRecord | null>
  signer: DetachedBirthSigner
  issuerPublicKeyPem: string
  trustedIssuerFingerprint: string
  storage: VerifiedBirthStorage
}>): Promise<BirthIssuanceOutcome> {
  const grant = input.grant
  if (!grant || !grant.approved || !grant.tenantId?.trim()
    || !grant.harnessRunId?.trim() || !grant.permanentArtifactId?.trim()) return 'invalid_grant'
  try {
    if (!await input.verifyGrant(grant)) return 'invalid_grant'
    const birth = await input.readNativeBirth(grant.tenantId, grant.permanentArtifactId)
    if (!birth || birth.permanent_artifact_id !== grant.permanentArtifactId) return 'birth_mismatch'
    // The tenant-scoped lookup can be slow: recheck live Harness authority immediately
    // before invoking a consequential external signer, not only before lookup/storage.
    if (!await input.verifyGrant(grant)) return 'invalid_grant'
    // Never call an external signer if a native birth row cannot be independently verified.
    const cert = await signNativeBirthRecord(birth, input.signer, input.issuerPublicKeyPem, input.trustedIssuerFingerprint)
    if (!cert) return 'signer_failed'
    return persistVerifiedNativeBirth({
      certificate: cert,
      trustedIssuerFingerprint: input.trustedIssuerFingerprint,
      authorize: async artifactId => artifactId === grant.permanentArtifactId && await input.verifyGrant(grant),
      storage: input.storage,
    })
  } catch { return 'storage_failed' }
}
