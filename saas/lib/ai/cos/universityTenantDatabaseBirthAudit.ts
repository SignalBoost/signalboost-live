// Phase 2: compose the already-verified Harness authority with canonical tenant-owned DB reads.
// This is a server-only integration seam, not an authenticated public endpoint.
// No certificate may grant a new serving, graduation, or signing capability.
import { auditBirthWithTrustedHarness } from './universityHarnessBoundBirthAudit.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import { createTenantOwnedBirthSource } from './universityTenantOwnedBirthSource.ts'
import type { AuthorizedBirthAuditContext, AuthorizedBirthAuditOutcome } from './universityAuthorizedBirthAudit.ts'

type Query = {
  select: (columns: string) => Query
  eq: (column: string, value: string) => Query
  maybeSingle: () => Promise<{ data: any; error: unknown }>
}
type ServerDb = { schema: (name: string) => { from: (table: string) => Query }; from: (table: string) => Query }

export async function auditBirthAgainstTenantDatabase(input: Readonly<{
  context: AuthorizedBirthAuditContext
  /** Server-side identity is independently authenticated, never derived from a certificate. */
  authenticatedTenantId: string
  resolveTrustedRun: BirthHarnessAuthorityResolver
  trustedIssuerFingerprint: string
  serviceDb: ServerDb
}>): Promise<AuthorizedBirthAuditOutcome> {
  if (!input.authenticatedTenantId?.trim()
    || input.authenticatedTenantId !== input.context?.tenantId) return 'not_authorized'
  return auditBirthWithTrustedHarness({
    context: input.context,
    resolveTrustedRun: input.resolveTrustedRun,
    trustedIssuerFingerprint: input.trustedIssuerFingerprint,
    source: createTenantOwnedBirthSource(input.serviceDb),
  })
}
