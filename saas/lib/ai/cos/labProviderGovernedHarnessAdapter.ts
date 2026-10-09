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
  // Freeze the exact authorization and dispatch identity before any host await.
  const scope = Object.freeze({ ...input.scope })
  const { actionId, harnessRunId, secretReference, executor, resolveTrustedRun } = input
  if (!actionId?.trim() || !harnessRunId?.trim() || !secretReference?.trim()) return null
  try {
    // Resolve anew at the final invocation boundary; never accept a user-provided manifest.
    const run = await resolveTrustedRun(harnessRunId)
    if (!run || run.status !== 'active' || run.authorityVerified !== true) return null
    const manifest = run.manifest
    if (!manifest || manifest.runId !== harnessRunId
      || manifest.profile !== 'production' || !manifest.authorityManifestRef?.trim()
      || manifest.identity.tenantId !== scope.organizationId
      || manifest.identity.artifact?.artifactId !== scope.permanentArtifactId) return null
    const cap = manifest.capabilities.find(c => c.id === scope.capability && c.mutating === true
      && c.risk === 'consequential' && c.environments.includes(manifest.environment.class)
      && c.scopes?.includes(scope.providerId) === true
      && c.scopes?.includes(scope.permanentArtifactId) === true)
    if (!cap) return null
    return await executor.execute(manifest, {
      actionId,
      kind: 'provider.invoke',
      capabilityId: scope.capability,
      params: {
        providerId: scope.providerId, permanentArtifactId: scope.permanentArtifactId,
        secretReference,
      },
      // A provider call can have non-reversible external effects. Governed Socket
      // must enforce human approval when consequential and irreversible.
      compensation: { mode: 'irreversible', reason: 'external provider invocation' },
    })
  } catch { return null }
}
