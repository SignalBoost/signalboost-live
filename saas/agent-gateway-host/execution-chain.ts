// saas/agent-gateway-host/execution-chain.ts
//
// AUTOMATION FIRST, HUMAN AS THE BACKSTOP.
//
// A governance halt means a human DECIDES — it does not mean a human does the work. Once an
// action is authorized (allowlisted up front, or approved in the cockpit), execution should
// be automatic wherever a machine can do it. This chain encodes that order:
//
//   1. API        — the provider has a real endpoint. Fastest, most auditable. Preferred.
//   2. BROWSER    — no API exists, so an agent drives the vendor's own UI.
//   3. MANUAL     — no machine can act; a person is given the task, explicitly.
//
// The chain is the same idea as the infrastructure-PR merge router (ONBOARD-full §12): the
// approval gate, the staging, and the audit trail never change — only the executor does.
//
// DECLINING IS NOT FAILING — the distinction the whole design rests on.
//   • An executor that DECLINES ({ handled: false }) is saying "this isn't mine". The baton
//     passes to the next one. Nothing was attempted, so nothing can be half-done.
//   • An executor that FAILS ({ handled: true, ok: false }) tried and broke. The chain STOPS.
//     Falling through here would be the dangerous case: a provider call that returned 502
//     may still have had an effect, and re-attempting the same action by a different route
//     could double-charge, double-send, or act on a partially-changed system.
// Collapsing those two into one "it didn't work" is how automation chains quietly become
// double-execution bugs, so they are separate types here and separately tested.

import type { AgentRequest, ExecutionPort } from '../agent-gateway/index.ts'
import { filterParams } from './universal-execution.ts'
import type {
  ExecutableAction,
  RunUniversalProviderFn,
} from './universal-execution.ts'

/** The outcome of offering one request to one executor. */
export type ChainAttempt =
  /** Not mine — try the next executor. Nothing was attempted. */
  | { handled: false; reason?: string }
  /** Mine. It ran (ok) or it broke (ok:false). Either way the chain stops here. */
  | { handled: true; ok: boolean; result?: unknown; error?: string }

export interface ChainExecutor {
  /** Stable id, recorded so an audit can show WHICH mechanism acted. */
  id: string
  attempt(request: AgentRequest): Promise<ChainAttempt>
}

export interface ExecutionChainOptions {
  /** Tried in order. Put the most automated mechanism first. */
  executors: readonly ChainExecutor[]
  /** Optional hook: called with the id of whichever executor handled the request. */
  onHandled?: (executorId: string, request: AgentRequest, ok: boolean) => void
}

/**
 * Build an ExecutionPort that walks the executor chain.
 *
 * If every executor declines, the result is ok:false — the action was authorized but no
 * mechanism exists to carry it out. That is a real, reportable state, not a crash: whoever
 * approved it needs to know it is still undone.
 */
export function createExecutionChain(options: ExecutionChainOptions): ExecutionPort {
  return {
    async perform(request: AgentRequest): Promise<{ ok: boolean; result?: unknown; error?: string }> {
      const declined: string[] = []

      for (const executor of options.executors) {
        let attempt: ChainAttempt
        try {
          attempt = await executor.attempt(request)
        } catch (err) {
          // A THROWING executor is treated as a failure, not a decline. It may have acted
          // before it threw, so the chain must not try another route to the same effect.
          const detail = err instanceof Error ? err.message : 'executor threw'
          options.onHandled?.(executor.id, request, false)
          return { ok: false, error: `${executor.id}: ${detail}` }
        }

        if (!attempt.handled) {
          declined.push(attempt.reason ? `${executor.id} (${attempt.reason})` : executor.id)
          continue
        }

        options.onHandled?.(executor.id, request, attempt.ok)
        return attempt.ok
          ? { ok: true, result: attempt.result }
          : { ok: false, error: `${executor.id}: ${attempt.error ?? 'execution failed'}` }
      }

      return {
        ok: false,
        error:
          `no executor could perform ${request.action.kind}:${request.action.target} — ` +
          `declined by: ${declined.join(', ') || 'none registered'}`,
      }
    },
  }
}

// ---- Executor 1: the provider API, via universalRunner ----

export interface UniversalChainExecutorOptions {
  runUniversalProvider: RunUniversalProviderFn
  /** The closed action map. An unmapped action DECLINES so the chain can continue. */
  actions: readonly ExecutableAction[]
}

/**
 * The API executor. Same closed-map discipline as createUniversalExecutionPort — an action
 * must be explicitly registered to run — but an unmapped action DECLINES rather than
 * refusing outright, so a browser or manual executor can pick it up.
 */
export function createUniversalChainExecutor(options: UniversalChainExecutorOptions): ChainExecutor {
  const map = new Map(options.actions.map((a) => [`${a.actionKind}\u0000${a.target}`, a]))

  return {
    id: 'api',
    async attempt(request: AgentRequest): Promise<ChainAttempt> {
      const entry = map.get(`${request.action.kind}\u0000${request.action.target}`)
      if (!entry) return { handled: false, reason: 'no API mapping' }

      const outcome = await options.runUniversalProvider({
        providerId: entry.providerId,
        actionId: entry.actionId,
        variables: filterParams(request.action.params, entry.allowedParams),
      })

      if (!outcome.ok) {
        return { handled: true, ok: false, error: outcome.error ?? `provider returned ${outcome.status}` }
      }
      return { handled: true, ok: true, result: outcome.outputs }
    },
  }
}

// ---- Executor 2: the browser agent ----

/** What a browser executor needs to drive a vendor UI for one action. */
export interface BrowserExecutableAction {
  actionKind: string
  target: string
  /** Origin the agent is permitted to act on. Exact HTTPS origin, no wildcards. */
  origin: string
  /** Opaque descriptor the browser runtime understands (selectors, steps, evidence plan). */
  plan: Record<string, unknown>
}

export interface BrowserChainExecutorOptions {
  actions: readonly BrowserExecutableAction[]
  /**
   * Supplied by the host once a real execution host exists. Chromium cannot run in a
   * serverless function, so until a worker/container is wired this is absent and the
   * executor declines honestly rather than queueing work that will never run.
   */
  runBrowserAction?: (
    action: BrowserExecutableAction,
    request: AgentRequest,
  ) => Promise<{ ok: boolean; result?: unknown; error?: string }>
}

/**
 * The browser executor: the actuator of last resort for actions with no provider API.
 *
 * It DECLINES — loudly and for a stated reason — when no execution host is configured.
 * Silently accepting work it cannot perform would be the "coded but never wired" trap: the
 * action would look dispatched and simply never happen.
 */
export function createBrowserChainExecutor(options: BrowserChainExecutorOptions): ChainExecutor {
  const map = new Map(options.actions.map((a) => [`${a.actionKind}\u0000${a.target}`, a]))

  return {
    id: 'browser',
    async attempt(request: AgentRequest): Promise<ChainAttempt> {
      const entry = map.get(`${request.action.kind}\u0000${request.action.target}`)
      if (!entry) return { handled: false, reason: 'no browser plan' }
      if (!options.runBrowserAction) {
        return { handled: false, reason: 'no browser execution host configured' }
      }

      const outcome = await options.runBrowserAction(entry, request)
      return outcome.ok
        ? { handled: true, ok: true, result: outcome.result }
        : { handled: true, ok: false, error: outcome.error ?? 'browser action failed' }
    },
  }
}

// ---- Executor 3: the human backstop ----

export interface ManualChainExecutorOptions {
  /**
   * Record a task for a person. Returns a reference (ticket id, task id) so the outcome
   * names something a human can actually be pointed at.
   */
  recordManualTask: (request: AgentRequest) => Promise<{ ok: boolean; reference?: string; error?: string }>
}

/**
 * The last link: no machine can perform this, so a person is given the task explicitly.
 *
 * This handles the request rather than declining — assigning the work IS the outcome. It
 * reports ok:true with the task reference, and the result says plainly that the action is
 * pending a human, so nothing downstream mistakes "assigned" for "done".
 */
export function createManualChainExecutor(options: ManualChainExecutorOptions): ChainExecutor {
  return {
    id: 'manual',
    async attempt(request: AgentRequest): Promise<ChainAttempt> {
      const outcome = await options.recordManualTask(request)
      if (!outcome.ok) {
        return { handled: true, ok: false, error: outcome.error ?? 'could not record a manual task' }
      }
      return {
        handled: true,
        ok: true,
        result: {
          status: 'assigned_to_human',
          reference: outcome.reference ?? null,
          note:
            `No automated mechanism could perform ${request.action.kind}:${request.action.target}. ` +
            'A person has been assigned the task; the action is NOT yet done.',
        },
      }
    },
  }
}
