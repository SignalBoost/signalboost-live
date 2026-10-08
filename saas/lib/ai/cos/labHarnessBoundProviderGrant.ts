// Phase 3: bind buyer-owned provider grant validation to trusted active Harness authority.
// This is a preflight decision only, NOT permission to execute a provider call.
// Host must independently resolve a verified durable run, and enforce it again at the Governed Socket.
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import { validateTenantProviderGrant, type ProviderGrant, type ProviderUseScope } from './labTenantProviderGrantGuard.ts'

export async function authorizeTenantProviderPreflight(input: Readonly<{
  scope: ProviderUseScope
  harnessRunId: string
  resolveTrustedRun: BirthHarnessAuthorityResolver
  readGrant: (scope: ProviderUseScope) => Promise<ProviderGrant | null>
  now: Date
}>): Promise<Readonly<{ allowed: boolean; secretReference: string | null }>> {
  const denied = { allowed: false, secretReference: null } as const
  const { scope, harnessRunId } = input
  if (!scope || !harnessRunId?.trim()) return denied
  const check = async () => {
    const run = await input.resolveTrustedRun(harnessRunId)
    if (!run || run.status !== 'active' || run.authorityVerified !== true) return false
    const m = run.manifest
    if (!m || m.runId !== harnessRunId || m.identity.tenantId !== scope.organizationId
      || m.identity.artifact?.artifactId !== scope.permanentArtifactId
      || !m.authorityManifestRef?.trim() || m.profile !== 'production'
      || !['staging', 'production'].includes(m.environment.class)
      || (m.deadlineAt !== undefined && (!Number.isFinite(Date.parse(m.deadlineAt))
        || Date.parse(m.deadlineAt) <= input.now.getTime()))) return false
    return m.capabilities.some(cap => cap.id === scope.capability && cap.mutating === true
      && cap.risk === 'consequential'
      && cap.environments.includes(m.environment.class)
      && cap.scopes?.includes(scope.permanentArtifactId) === true
      && cap.scopes?.includes(scope.providerId) === true)
  }
  try {
    if (!await check()) return denied
    const grant = await input.readGrant(scope)
    // Re-check active authority and grant validity after an async tenant data read.
    if (!await check()) return denied
    return validateTenantProviderGrant(scope, grant, input.now)
  } catch { return denied }
}
