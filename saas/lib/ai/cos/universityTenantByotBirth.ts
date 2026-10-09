// Commercial Phase 2 BYOT: tenant-owned signer and storage, with independently
// verified Harness authority. No platform Supabase or platform AWS dependency.
// The authenticated host resolves this provider from its tenant connection registry,
// NOT from a customer-supplied URL, certificate payload, or arbitrary tool output.
import { issueVerifiedNativeBirth, type BirthIssuanceOutcome } from './universityAuthorizedBirthIssuance.ts'
import { verifyTrustedBirthGrant, type BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { BirthRecord, DetachedBirthSigner } from './universityBirthRecordSigningBoundary.ts'
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

export type TenantBirthProvider = Readonly<{
  tenantId: string
  /** Identifier of a previously authenticated customer-owned provider connection. */
  connectionId: string
  /** Trusted issuer pin obtained from the tenant connection registry. */
  trustedIssuerFingerprint: string
  issuerPublicKeyPem: string
  signer: DetachedBirthSigner
  readNativeBirth: (artifactId: string) => Promise<BirthRecord | null>
  insertOnce: (row: SignedBirthStorageRow) => Promise<boolean>
  readStored: (artifactId: string) => Promise<SignedBirthStorageRow | null>
}>

export type TenantBirthProviderResolver = (tenantId: string) => Promise<TenantBirthProvider | null>

/** Deliberately no API or provider registration side effect: host supplies real active Harness authority. */
export async function issueTenantByotBirth(input: Readonly<{
  tenantId: string
  harnessRunId: string
  permanentArtifactId: string
  resolveTrustedRun: BirthHarnessAuthorityResolver
  resolveTenantProvider: TenantBirthProviderResolver
}>): Promise<BirthIssuanceOutcome | 'provider_unavailable'> {
  const grant = {
    tenantId: input.tenantId,
    harnessRunId: input.harnessRunId,
    permanentArtifactId: input.permanentArtifactId,
    approved: true,
  } as const
  // Do not even access the tenant's provider credentials before checking
  // the independently durable active Harness authorization.
  if (!await verifyTrustedBirthGrant(grant, input.resolveTrustedRun)) return 'invalid_grant'
  let provider: TenantBirthProvider | null
  try { provider = await input.resolveTenantProvider(input.tenantId) }
  catch { return 'provider_unavailable' }
  if (!provider || provider.tenantId !== input.tenantId || !provider.connectionId.trim()
    || !provider.trustedIssuerFingerprint || !provider.issuerPublicKeyPem) return 'provider_unavailable'

  return issueVerifiedNativeBirth({
    grant,
    verifyGrant: candidate => verifyTrustedBirthGrant(candidate, input.resolveTrustedRun),
    readNativeBirth: async (tenantId, artifactId) =>
      tenantId === provider.tenantId && artifactId === grant.permanentArtifactId
        ? provider.readNativeBirth(artifactId) : null,
    signer: provider.signer,
    issuerPublicKeyPem: provider.issuerPublicKeyPem,
    trustedIssuerFingerprint: provider.trustedIssuerFingerprint,
    storage: {
      readNativeBirth: artifactId => artifactId === grant.permanentArtifactId
        ? provider.readNativeBirth(artifactId) : Promise.resolve(null),
      insertOnce: row => row.permanent_artifact_id === grant.permanentArtifactId
        ? provider.insertOnce(row) : Promise.resolve(false),
      readStored: artifactId => artifactId === grant.permanentArtifactId
        ? provider.readStored(artifactId) : Promise.resolve(null),
    },
  })
}
