// Phase 2: least-privilege read-only Harness authorization for artifact certificate audits.
// The resolver MUST independently authenticate a durable active HarnessRun and its host authority.
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import { auditTenantBirthCertificate, type AuthorizedBirthAuditContext, type AuthorizedBirthAuditSource, type AuthorizedBirthAuditOutcome } from './universityAuthorizedBirthAudit.ts'

export const BIRTH_AUDIT_CAPABILITY = 'university.artifact.birth.audit' as const

export async function auditBirthWithTrustedHarness(input: Readonly<{
  context: AuthorizedBirthAuditContext
  resolveTrustedRun: BirthHarnessAuthorityResolver
  trustedIssuerFingerprint: string
  source: AuthorizedBirthAuditSource
}>): Promise<AuthorizedBirthAuditOutcome> {
  const authorize = async (ctx: AuthorizedBirthAuditContext): Promise<boolean> => {
    if (!ctx?.harnessRunId?.trim() || !ctx.tenantId?.trim() || !ctx.permanentArtifactId?.trim()) return false
    try {
      const run = await input.resolveTrustedRun(ctx.harnessRunId)
      if (!run || run.status !== 'active' || run.authorityVerified !== true) return false
      const m = run.manifest
      if (!m || m.runId !== ctx.harnessRunId || m.identity.tenantId !== ctx.tenantId
        || m.identity.artifact?.artifactId !== ctx.permanentArtifactId
        || !m.authorityManifestRef?.trim() || m.profile !== 'production'
        || !['staging', 'production'].includes(m.environment.class)
        || (m.deadlineAt !== undefined && (!Number.isFinite(Date.parse(m.deadlineAt))
          || Date.parse(m.deadlineAt) <= Date.now()))) return false
      return m.capabilities.some(cap => cap.id === BIRTH_AUDIT_CAPABILITY
        && cap.mutating === false && cap.risk === 'read'
        && cap.environments.includes(m.environment.class)
        && cap.scopes?.includes(ctx.permanentArtifactId) === true)
    } catch { return false }
  }
  return auditTenantBirthCertificate({ ...input, authorize })
}
