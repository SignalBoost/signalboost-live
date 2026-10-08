// Phase 2: independent, tenant-scoped read-and-hash proof for an exact signed artifact.
// No endpoint, access grants, artifact registration or graduation authority is created here.
import type { HarnessManifest } from '../../../platform-harness/core/types.ts'
import { verifyBirthIdentity, type SignedBirthIdentity } from './universityArtifactBirthVerification.ts'
import { verifySignedArtifactBytes } from './universitySignedArtifactByteIntegrity.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'

export const ARTIFACT_INTEGRITY_READ_CAPABILITY = 'university.artifact.integrity.read' as const

export type GovernedArtifactIntegrityResult = Readonly<{
  verified: boolean
  reason: 'unauthorized' | 'invalid_certificate' | 'artifact_not_found'
    | 'artifact_bytes_mismatch' | 'size_limit' | 'read_failure' | 'verified'
  observedSha256: string | null
}>

function authorized(manifest: HarnessManifest, tenantId: string, artifactId: string, runId: string): boolean {
  if (manifest.runId !== runId || manifest.identity.tenantId !== tenantId
    || manifest.identity.artifact?.artifactId !== artifactId
    || !manifest.authorityManifestRef?.trim()
    || !['production', 'staging'].includes(manifest.environment.class)
    || manifest.profile !== 'production'
    || (manifest.deadlineAt !== undefined
      && (!Number.isFinite(Date.parse(manifest.deadlineAt)) || Date.parse(manifest.deadlineAt) <= Date.now()))) return false
  return manifest.capabilities.some(capability =>
    capability.id === ARTIFACT_INTEGRITY_READ_CAPABILITY
    && capability.risk === 'read'
    && capability.mutating === false
    && capability.environments.includes(manifest.environment.class)
    && capability.scopes?.includes(artifactId) === true)
}

/** Host must resolve trusted authority and enforce tenant isolation in openArtifactBytes. */
export async function verifyGovernedArtifactIntegrity(input: Readonly<{
  tenantId: string
  harnessRunId: string
  certificate: SignedBirthIdentity
  trustedIssuerFingerprint: string
  maxBytes: number
  resolveTrustedRun: BirthHarnessAuthorityResolver
  openArtifactBytes: (tenantId: string, artifactId: string, expectedHash: string) => Promise<AsyncIterable<Uint8Array> | null>
}>): Promise<GovernedArtifactIntegrityResult> {
  const artifactId = input.certificate?.payload?.permanentArtifactId
  const hash = input.certificate?.payload?.trainedArtifactHash
  if (!input.tenantId?.trim() || !input.harnessRunId?.trim() || typeof artifactId !== 'string')
    return { verified: false, reason: 'unauthorized', observedSha256: null }
  try {
    const trusted = await input.resolveTrustedRun(input.harnessRunId)
    if (!trusted || trusted.status !== 'active' || trusted.authorityVerified !== true
      || !authorized(trusted.manifest, input.tenantId, artifactId, input.harnessRunId))
      return { verified: false, reason: 'unauthorized', observedSha256: null }
    if (!verifyBirthIdentity(input.certificate, hash, input.trustedIssuerFingerprint).valid)
      return { verified: false, reason: 'invalid_certificate', observedSha256: null }
    // Resolve authorized content only after pin and signature checks.
    const bytes = await input.openArtifactBytes(input.tenantId, artifactId, hash)
    if (!bytes) return { verified: false, reason: 'artifact_not_found', observedSha256: null }
    const result = await verifySignedArtifactBytes({
      certificate: input.certificate, trustedIssuerFingerprint: input.trustedIssuerFingerprint,
      bytes, maxBytes: input.maxBytes,
    })
    // Recheck authority after potentially slow streaming before declaring a valid proof.
    const after = await input.resolveTrustedRun(input.harnessRunId)
    if (!after || after.status !== 'active' || after.authorityVerified !== true
      || !authorized(after.manifest, input.tenantId, artifactId, input.harnessRunId))
      return { verified: false, reason: 'unauthorized', observedSha256: null }
    return result
  } catch {
    return { verified: false, reason: 'read_failure', observedSha256: null }
  }
}
