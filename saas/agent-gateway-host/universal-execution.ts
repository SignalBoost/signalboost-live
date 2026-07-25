// saas/agent-gateway-host/universal-execution.ts
//
// EXECUTION PORT — the narrow path an allowlisted action takes to actually run.
//
// Gate 2 has already decided this action is reversible_internal, explicitly allowlisted, and
// carries a rollback. This adapter is what happens next: it maps the action onto a
// provider_registry row and runs it through universalRunner, the provider-neutral backend
// runner (ONBOARD-full §12).
//
// THE SECOND LOCK. This adapter is a CLOSED MAP, never a passthrough. It would be far
// simpler to forward request.action.target straight to universalRunner as an actionId —
// and that would quietly turn the ExecutionPort into "run any provider action in the
// registry" for anything that cleared Gate 2. One mistaken allowlist entry would then reach
// the whole registry. Instead, every executable action must be explicitly registered here
// with its providerId and actionId; an unmapped target is refused. Two independent locks
// have to be opened by hand before an agent's request touches a provider.
//
// HOST CODE, NOT PORTABLE CODE. universalRunner reads public.provider_registry and resolves
// secrets service-role — SignalBoost infrastructure. A buyer implements ExecutionPort
// against their own runner and the governance core is unchanged.
//
// universalRunner is INJECTED, not imported: importing it pulls a Supabase client in at
// module load, which would make this file untestable under `node --test`.

import type { AgentRequest, ExecutionPort } from '../agent-gateway/index.ts'

/** Mirrors UniversalRunnerInput without importing lib/engine/universalRunner. */
export interface UniversalRunnerCall {
  providerId: string
  actionId: string
  variables?: Record<string, unknown>
}

/** Mirrors UniversalRunnerResult's relevant fields. */
export interface UniversalRunnerOutcome {
  ok: boolean
  status: number
  outputs: Record<string, unknown>
  error?: string
}

export type RunUniversalProviderFn = (input: UniversalRunnerCall) => Promise<UniversalRunnerOutcome>

/** One explicitly-registered executable action. */
export interface ExecutableAction {
  /** Matches AgentRequest.action.kind. */
  actionKind: string
  /** Matches AgentRequest.action.target. */
  target: string
  providerId: string
  actionId: string
  /**
   * Parameter names permitted to reach the provider. Anything else the agent sent is
   * dropped. An agent should not be able to smuggle an unexpected field into a provider
   * call just because the action itself was approved.
   */
  allowedParams?: readonly string[]
}

export interface UniversalExecutionPortOptions {
  runUniversalProvider: RunUniversalProviderFn
  /** The closed set of executable actions. Empty means nothing can execute. */
  actions: readonly ExecutableAction[]
}

function keyOf(actionKind: string, target: string): string {
  return `${actionKind}\u0000${target}`
}

/** Filter agent-supplied params down to the action's declared allowlist. */
export function filterParams(
  params: Record<string, unknown> | undefined,
  allowed: readonly string[] | undefined,
): Record<string, unknown> {
  if (!params) return {}
  if (!allowed) return { ...params }
  const out: Record<string, unknown> = {}
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(params, key)) out[key] = params[key]
  }
  return out
}

/**
 * Build an ExecutionPort backed by universalRunner over a closed action map.
 *
 * An unmapped action returns ok:false rather than throwing — the governance core records
 * the failure and audits it, and nothing runs. Refusing is the correct outcome, not an
 * exceptional one.
 */
export function createUniversalExecutionPort(options: UniversalExecutionPortOptions): ExecutionPort {
  const map = new Map(options.actions.map((a) => [keyOf(a.actionKind, a.target), a]))

  return {
    async perform(request: AgentRequest): Promise<{ ok: boolean; result?: unknown; error?: string }> {
      const entry = map.get(keyOf(request.action.kind, request.action.target))
      if (!entry) {
        return {
          ok: false,
          error:
            `no executable mapping for ${request.action.kind}:${request.action.target} — ` +
            'actions must be explicitly registered with the host before they can run',
        }
      }

      try {
        const outcome = await options.runUniversalProvider({
          providerId: entry.providerId,
          actionId: entry.actionId,
          variables: filterParams(request.action.params, entry.allowedParams),
        })

        if (!outcome.ok) {
          return { ok: false, error: outcome.error ?? `provider call failed with status ${outcome.status}` }
        }
        return { ok: true, result: outcome.outputs }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'provider call threw' }
      }
    },
  }
}

/** An ExecutionPort that refuses everything. The correct default before any action is registered. */
export const refuseAllExecutionPort: ExecutionPort = {
  async perform() {
    return { ok: false, error: 'no executable actions are registered on this host' }
  },
}
