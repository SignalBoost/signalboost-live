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
  try {
    const first = await authorizeTenantProviderPreflight({ ...input, now: input.now() })
    if (!first.allowed) return denied
    // A network hop, lease renewal or queue delay may revoke the original approval.
    // Re-fetch the grant and Harness authority immediately before invoking the socket.
    const fresh = await authorizeTenantProviderPreflight({ ...input, now: input.now() })
    if (!fresh.allowed || fresh.secretReference !== first.secretReference) return denied
    const value = await input.executeGoverned({
      scope: input.scope, harnessRunId: input.harnessRunId,
      secretReference: fresh.secretReference!,
    })
    return { status: 'executed', value }
  } catch {
    return { status: 'execution_failed', value: null }
  }
}
