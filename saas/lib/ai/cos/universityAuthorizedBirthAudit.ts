// Phase 2 read-only verification service. All inputs below are server-owned.
// Tenant authorizer and data source must independently enforce the caller's verified identity.
// A cryptographically valid birth is not authorization, graduation, or permission to serve.
import { auditStoredBirthCertificate, type StoredBirthAudit } from './universityStoredBirthAudit.ts'
import type { BirthRecord } from './universityBirthRecordSigningBoundary.ts'
import type { SignedBirthStorageRow } from './universityVerifiedBirthPersistence.ts'

export type AuthorizedBirthAuditOutcome = StoredBirthAudit | 'not_authorized' | 'read_failed'
export type AuthorizedBirthAuditContext = Readonly<{
  tenantId: string
  permanentArtifactId: string
  harnessRunId: string
}>
export type AuthorizedBirthAuditSource = Readonly<{
  // Separate reads must enforce the same tenant+artifact constraint in the database.
  readBirth: (tenantId: string, id: string) => Promise<BirthRecord | null>
  readSignedEnvelope: (tenantId: string, id: string) => Promise<SignedBirthStorageRow | null>
}>
export async function auditTenantBirthCertificate(input: Readonly<{
  context: AuthorizedBirthAuditContext
  /** Host-authenticated, tenant-bound authority; never from the incoming certificate. */
  authorize: (context: AuthorizedBirthAuditContext) => Promise<boolean>
  trustedIssuerFingerprint: string
  source: AuthorizedBirthAuditSource
}>): Promise<AuthorizedBirthAuditOutcome> {
  const { context } = input
  if (!context?.tenantId?.trim() || !context?.permanentArtifactId?.trim()
    || !context?.harnessRunId?.trim()) return 'not_authorized'
  try {
    if (!await input.authorize(context)) return 'not_authorized'
    const birth = await input.source.readBirth(context.tenantId, context.permanentArtifactId)
    // Re-check before second read to avoid accessing a tenant record after revocation.
    if (!await input.authorize(context)) return 'not_authorized'
    const envelope = await input.source.readSignedEnvelope(context.tenantId, context.permanentArtifactId)
    // Do not release a verified result after revocation during the signed-envelope read.
    if (!await input.authorize(context)) return 'not_authorized'
    if (birth && birth.permanent_artifact_id !== context.permanentArtifactId) return 'read_failed'
    if (envelope && envelope.permanent_artifact_id !== context.permanentArtifactId) return 'read_failed'
    return auditStoredBirthCertificate({ birth, stored: envelope, trustedIssuerFingerprint: input.trustedIssuerFingerprint })
  } catch { return 'read_failed' }
}
