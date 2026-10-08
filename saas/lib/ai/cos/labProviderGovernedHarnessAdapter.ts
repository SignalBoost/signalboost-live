// Phase 3: invoke the existing Platform Harness governed executor, never a raw provider SDK.
// No secret material enters the request; the host must independently authorize vault redemption.
import type { GovernedHarnessExecutor, HarnessActionResult } from '../../../platform-harness/runtime/governed-executor.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { ProviderUseScope } from './labTenantProviderGrantGuard.ts'

export async function executeProviderViaHarness(input: Readonly<{
  scope: ProviderUseScope
  harnessRunId: string
  secretReference: string
  actionId: string
  executor: GovernedHarnessExecutor
  resolveTrustedRun: BirthHarnessAuthorityResolver
}>): Promise<HarnessActionResult | null> {
  const { scope } = input
  if (!input.actionId?.trim() || !input.harnessRunId?.trim() || !input.secretReference?.trim()) return null
  try {
    // Resolve anew at the final invocation boundary; never accept a user-provided manifest.
    const run = await input.resolveTrustedRun(input.harnessRunId)
    if (!run || run.status !== 'active' || run.authorityVerified !== true) return null
    const manifest = run.manifest
    if (!manifest || manifest.runId !== input.harnessRunId
      || manifest.profile !== 'production' || !manifest.authorityManifestRef?.trim()
      || manifest.identity.tenantId !== scope.organizationId
      || manifest.identity.artifact?.artifactId !== scope.permanentArtifactId) return null
    const cap = manifest.capabilities.find(c => c.id === scope.capability && c.mutating === true
      && c.risk === 'consequential' && c.environments.includes(manifest.environment.class)
      && c.scopes?.includes(scope.providerId) === true
      && c.scopes?.includes(scope.permanentArtifactId) === true)
    if (!cap) return null
    return await input.executor.execute(manifest, {
      actionId: input.actionId,
      kind: 'provider.invoke',
      capabilityId: scope.capability,
      params: {
        providerId: scope.providerId, permanentArtifactId: scope.permanentArtifactId,
        secretReference: input.secretReference,
      },
      // A provider call can have non-reversible external effects. Governed Socket
      // must enforce human approval when consequential and irreversible.
      compensation: { mode: 'irreversible', reason: 'external provider invocation' },
    })
  } catch { return null }
}
