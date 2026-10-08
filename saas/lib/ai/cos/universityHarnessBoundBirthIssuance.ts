// Phase 2: compose issuance with the independently trusted HarnessRun authority resolver.
// Not a public route, KMS implementation, or replacement for the platform's governed socket.
// Host MUST supply a server-only durable run resolver and tenant-scoped data/KMS adapters.
import { issueVerifiedNativeBirth, type TrustedBirthIssuanceGrant, type BirthIssuanceOutcome } from './universityAuthorizedBirthIssuance.ts'
import { verifyTrustedBirthGrant, type BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { BirthRecord, DetachedBirthSigner } from './universityBirthRecordSigningBoundary.ts'
import type { VerifiedBirthStorage } from './universityVerifiedBirthPersistence.ts'

export async function issueBirthWithTrustedHarness(input: Readonly<{
  grant: TrustedBirthIssuanceGrant
  resolveTrustedRun: BirthHarnessAuthorityResolver
  readNativeBirth: (tenantId: string, permanentArtifactId: string) => Promise<BirthRecord | null>
  signer: DetachedBirthSigner
  issuerPublicKeyPem: string
  trustedIssuerFingerprint: string
  storage: VerifiedBirthStorage
}>): Promise<BirthIssuanceOutcome> {
  // The grant's approved flag never bypasses the host-authenticated Harness resolver.
  return issueVerifiedNativeBirth({
    ...input,
    verifyGrant: grant => verifyTrustedBirthGrant(grant, input.resolveTrustedRun),
  })
}
