// Customer LAB artifact delivery authorization: platform tool use, not model certification.
// This is a *decision* contract, not a download route. The authenticated host must
// resolve session, tenant membership, immutable artifact ownership, stored exact
// bytes/hash, and execution authority from trusted sources, never caller input.
export type LabExportRequest = Readonly<{
  authenticatedUserId: string | null
  requestedOrganizationId: string
  requestedArtifactId: string
}>
export type VerifiedLabExportEvidence = Readonly<{
  // Populated only by the authenticated server from durable data.
  organizationId: string
  artifactId: string
  requestingUserId: string
  activeMember: boolean
  executionAuthorityVerified: boolean
  storageObjectVerified: boolean
  artifactReady: boolean
  storedSha256: string
  independentlyComputedSha256: string
  storageTenantId: string
}>
export type LabExportDecision =
  | { allowed: true; artifactId: string; organizationId: string; sha256: string }
  | { allowed: false; reason: 'unauthorized' | 'ownership_mismatch' | 'not_ready' | 'integrity_failed' }

const SHA256 = /^[a-f0-9]{64}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Graduation or Referee competency grade is intentionally NOT an input. */
export function authorizeCustomerArtifactExport(
  request: LabExportRequest,
  evidence: VerifiedLabExportEvidence | null,
): LabExportDecision {
  if (!request.authenticatedUserId?.trim() || !evidence?.activeMember
    || evidence.requestingUserId !== request.authenticatedUserId
    || !evidence.executionAuthorityVerified) {
    return { allowed: false, reason: 'unauthorized' }
  }
  if (!UUID.test(request.requestedOrganizationId) || !UUID.test(request.requestedArtifactId)
    || request.requestedOrganizationId !== evidence.organizationId
    || request.requestedOrganizationId !== evidence.storageTenantId
    || request.requestedArtifactId !== evidence.artifactId) {
    return { allowed: false, reason: 'ownership_mismatch' }
  }
  if (!evidence.artifactReady || !evidence.storageObjectVerified) {
    return { allowed: false, reason: 'not_ready' }
  }
  const stored = evidence.storedSha256.toLowerCase()
  const computed = evidence.independentlyComputedSha256.toLowerCase()
  if (!SHA256.test(stored) || !SHA256.test(computed) || stored !== computed) {
    return { allowed: false, reason: 'integrity_failed' }
  }
  return { allowed: true, artifactId: evidence.artifactId, organizationId: evidence.organizationId, sha256: stored }
}
