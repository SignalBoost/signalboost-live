// Phase 2 composition: mandatory durable Harness authorization for certificate issuance.
// This module deliberately takes no untrusted boolean approval as its authority.
import { issueVerifiedNativeBirth, type BirthIssuanceOutcome, type TrustedBirthIssuanceGrant } from './universityAuthorizedBirthIssuance.ts'
import { verifyTrustedBirthGrant, type BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { BirthRecord, DetachedBirthSigner } from './universityBirthRecordSigningBoundary.ts'
import type { VerifiedBirthStorage } from './universityVerifiedBirthPersistence.ts'

export async function issueHarnessAuthorizedNativeBirth(input: Readonly<{
  tenantId: string
  harnessRunId: string
  permanentArtifactId: string
  resolveTrustedRun: BirthHarnessAuthorityResolver
  readNativeBirth: (tenantId: string, permanentArtifactId: string) => Promise<BirthRecord | null>
  signer: DetachedBirthSigner
  issuerPublicKeyPem: string
  trustedIssuerFingerprint: string
  storage: VerifiedBirthStorage
}>): Promise<BirthIssuanceOutcome> {
  const grant: TrustedBirthIssuanceGrant = {
    tenantId: input.tenantId,
    harnessRunId: input.harnessRunId,
    permanentArtifactId: input.permanentArtifactId,
    approved: true, // A request flag only; actual authority always comes from durable verification.
  }
  // Fail before invoking any birth lookup or external signer when the run is not authorized.
  if (!await verifyTrustedBirthGrant(grant, input.resolveTrustedRun)) return 'invalid_grant'
  return issueVerifiedNativeBirth({
    grant,
    verifyGrant: (candidate) => verifyTrustedBirthGrant(candidate, input.resolveTrustedRun),
    readNativeBirth: input.readNativeBirth,
    signer: input.signer,
    issuerPublicKeyPem: input.issuerPublicKeyPem,
    trustedIssuerFingerprint: input.trustedIssuerFingerprint,
    storage: input.storage,
  })
}
