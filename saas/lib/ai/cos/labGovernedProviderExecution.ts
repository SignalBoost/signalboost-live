// Phase 3: no provider action may rely on an earlier BYOI preflight alone.
// The host-owned governed executor must independently authorize the *same* run/scope.
import { authorizeTenantProviderPreflight } from './labHarnessBoundProviderGrant.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { ProviderGrant, ProviderUseScope } from './labTenantProviderGrantGuard.ts'

export type ProviderExecutionOutcome<T> =
  | Readonly<{ status: 'denied' | 'execution_failed'; value: null }>
  | Readonly<{ status: 'executed'; value: T }>

export async function executeTenantProviderGoverned<T>(input: Readonly<{
  scope: ProviderUseScope
  harnessRunId: string
  resolveTrustedRun: BirthHarnessAuthorityResolver
  readGrant: (scope: ProviderUseScope) => Promise<ProviderGrant | null>
  now: () => Date
  /** Host-owned Governed Socket. It must verify live signed authority at invocation. */
  executeGoverned: (args: Readonly<{
    scope: ProviderUseScope
    harnessRunId: string
    secretReference: string
  }>) => Promise<T>
}>): Promise<ProviderExecutionOutcome<T>> {
  const denied = { status: 'denied', value: null } as const
  // Snapshot tenant authority before any await: caller-held objects are not trusted to remain stable.
  if (!input?.scope || !input.harnessRunId?.trim()) return { status: 'denied', value: null }
  const scope: ProviderUseScope = Object.freeze({
    organizationId: input.scope.organizationId,
    permanentArtifactId: input.scope.permanentArtifactId,
    providerId: input.scope.providerId,
    capability: input.scope.capability,
  })
  const harnessRunId = input.harnessRunId
  // Capture host authority and execution callbacks before any asynchronous preflight.
  // A grant reader must not be able to replace the final executor mid-flight.
  const { readGrant, resolveTrustedRun, now, executeGoverned } = input
  const trustedInput = { scope, harnessRunId, readGrant, resolveTrustedRun }
  try {
    const first = await authorizeTenantProviderPreflight({ ...trustedInput, now: now() })
    if (!first.allowed) return denied
    // A network hop, lease renewal or queue delay may revoke the original approval.
    // Re-fetch the grant and Harness authority immediately before invoking the socket.
    const fresh = await authorizeTenantProviderPreflight({ ...trustedInput, now: now() })
    if (!fresh.allowed || fresh.secretReference !== first.secretReference) return denied
    const value = await executeGoverned({
      scope, harnessRunId,
      secretReference: fresh.secretReference!,
    })
    return { status: 'executed', value }
  } catch {
    return { status: 'execution_failed', value: null }
  }
}
