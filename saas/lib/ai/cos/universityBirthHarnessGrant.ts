// Phase 2: adapt a trusted, independently validated Platform Harness manifest to birth issuance.
// A manifest object alone is NOT an authorization token: the host must independently resolve
// the durable HarnessRun and original Referee/Guardian/host authority before trusting it.
import type { HarnessManifest } from '../../../platform-harness/core/types.ts'
import type { TrustedBirthIssuanceGrant } from './universityAuthorizedBirthIssuance.ts'

export const BIRTH_ISSUE_CAPABILITY = 'university.artifact.birth.sign' as const

export type BirthTrustedRun = Readonly<{
  manifest: HarnessManifest
  status: 'active' | 'completed' | 'failed' | 'cancelled'
  authorityVerified: boolean
}>

export type BirthHarnessAuthorityResolver = (
  runId: string,
) => Promise<BirthTrustedRun | null>

/** Only a host-authenticated manifest returned from the durable authority resolver can authorize issuance. */
export async function verifyTrustedBirthGrant(
  grant: TrustedBirthIssuanceGrant,
  resolveTrustedManifest: BirthHarnessAuthorityResolver,
): Promise<boolean> {
  if (!grant || grant.approved !== true
    || !grant.harnessRunId?.trim() || !grant.tenantId?.trim()
    || !grant.permanentArtifactId?.trim()) return false
  try {
    // Look up by the run identity, never by an artifact-provided envelope or custom approval flag.
    const trustedRun = await resolveTrustedManifest(grant.harnessRunId)
    if (!trustedRun || trustedRun.status !== 'active' || trustedRun.authorityVerified !== true) return false
    const { manifest } = trustedRun
    if (!manifest || manifest.runId !== grant.harnessRunId
      || manifest.identity.tenantId !== grant.tenantId
      || manifest.identity.artifact?.artifactId !== grant.permanentArtifactId
      || !manifest.authorityManifestRef?.trim()
      || manifest.profile !== 'production'
      || !['staging', 'production'].includes(manifest.environment.class)
      || (manifest.deadlineAt !== undefined
        && (!Number.isFinite(Date.parse(manifest.deadlineAt)) || Date.parse(manifest.deadlineAt) <= Date.now()))) return false

    return manifest.capabilities.some(capability =>
      capability.id === BIRTH_ISSUE_CAPABILITY
      && capability.mutating === true
      && capability.risk === 'consequential'
      && capability.environments.includes(manifest.environment.class)
      && capability.scopes?.includes(grant.permanentArtifactId) === true)
  } catch { return false }
}
