// Phase 3: fail-closed composition of live tenant grant checks and the existing Governed Socket.
// Host must supply a trusted durable-run resolver, tenant-scoped grant reader and governed executor.
// Never call this with a caller-provided secret or capability override.
import { executeTenantProviderGoverned, type ProviderExecutionOutcome } from './labGovernedProviderExecution.ts'
import { executeProviderViaHarness } from './labProviderGovernedHarnessAdapter.ts'
import type { ProviderGrant, ProviderUseScope } from './labTenantProviderGrantGuard.ts'
import type { BirthHarnessAuthorityResolver } from './universityBirthHarnessGrant.ts'
import type { GovernedHarnessExecutor, HarnessActionResult } from '../../../platform-harness/runtime/governed-executor.ts'

export async function dispatchBuyerOwnedProvider(input: Readonly<{
  scope: ProviderUseScope
  harnessRunId: string
  actionId: string
  now: () => Date
  resolveTrustedRun: BirthHarnessAuthorityResolver
  readGrant: (scope: ProviderUseScope) => Promise<ProviderGrant | null>
  executor: GovernedHarnessExecutor
}>): Promise<ProviderExecutionOutcome<HarnessActionResult>> {
  // Snapshot the action identity before any asynchronous grant or Harness lookup.
  // Caller-owned input may be mutated by an untrusted callback while awaiting.
  const actionId = input.actionId
  if (typeof actionId !== 'string' || !actionId.trim()) return { status: 'denied', value: null }
  const outcome = await executeTenantProviderGoverned({
    scope: input.scope,
    harnessRunId: input.harnessRunId,
    now: input.now,
    readGrant: input.readGrant,
    resolveTrustedRun: input.resolveTrustedRun,
    executeGoverned: async ({ scope, harnessRunId, secretReference }) => {
      const result = await executeProviderViaHarness({
        scope, harnessRunId, secretReference, actionId,
        executor: input.executor, resolveTrustedRun: input.resolveTrustedRun,
      })
      if (!result || result.status !== 'executed') {
        throw new Error('governed_provider_execution_denied')
      }
      return result
    },
  })
  return outcome
}
