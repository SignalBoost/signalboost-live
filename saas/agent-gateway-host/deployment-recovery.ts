// saas/agent-gateway-host/deployment-recovery.ts
//
// THE FIRST ACTION THE GATEWAY IS ALLOWED TO PERFORM.
//
// Everything in this directory has so far been able to do exactly one thing with a request:
// halt it. GATEWAY_ALLOWLIST shipped empty on purpose — the FDIR posture is that the
// pre-authorized envelope starts closed and widens only as a playbook earns trust. This
// module opens it by exactly one action, and picks the safest one that exists.
//
// WHY RETRYING A DEPLOYMENT IS THE RIGHT FIRST PLAYBOOK:
//
//   1. IT CANNOT DAMAGE PRODUCTION. A Vercel build that fails never becomes production —
//      the last healthy deployment keeps serving throughout. The worst case of a retry is
//      a second failed build and some build minutes. That is why the allowlist entry's
//      rollback is "none required": there is no state to undo.
//   2. IT FIXES A REAL CLASS OF INCIDENT. Transient build failures — a registry blip, a
//      network timeout, a flaky install — are a meaningful share of failed deploys, and a
//      retry is the entire fix. It will NOT fix a genuine code error, and it is not
//      pretended to.
//   3. IT CLASSIFIES HONESTLY. 'retry' is a reversible_internal token, so the classifier
//      reaches that class on the action's own merits. The target is named for what it does
//      — it was not worded to slip past a gate. If it were named for something destructive
//      it would classify that way and Gate 1 would halt it no matter what this file says.
//
// THE LOOP QUESTION, ANSWERED STRUCTURALLY. An automatic retry on a deployment-failure
// webhook is a genuine hazard: fail → webhook → retry → fail → webhook, forever. This
// module does not create that risk, because nothing on the webhook path can produce this
// target. resolveSupervisorRepairAction (supervisor-actions.ts) maps EVERY diagnosed repair
// step onto PROPOSED_REPAIR_TARGET, which is not allowlisted and always halts. The only
// route to this action is a human POSTing to the owner-gated retry endpoint. Unattended
// retry needs a durable attempt-counter first; it is deliberately not built here.

import type { AllowlistEntry } from '../agent-gateway/index.ts'
import type { ChainAttempt, ChainExecutor } from './execution-chain.ts'
import type { AgentRequest } from '../agent-gateway/index.ts'

/** The action kind the supervisor and the retry endpoint both use. */
export const RETRY_DEPLOYMENT_KIND = 'supervisor_repair'

/** Named for what it does. 'retry' is what makes it classify reversible_internal. */
export const RETRY_DEPLOYMENT_TARGET = 'platform.retry_deployment'

/**
 * The first — and currently only — entry in the pre-authorized envelope.
 *
 * Gate 2 requires a rollback on every allowlisted action. Here there is genuinely nothing
 * to roll back, and the entry says so in full rather than naming a fake compensating
 * action: a failed build is never promoted, so production is untouched either way.
 */
export const RETRY_DEPLOYMENT_ALLOWLIST_ENTRY: AllowlistEntry = Object.freeze({
  actionKind: RETRY_DEPLOYMENT_KIND,
  target: RETRY_DEPLOYMENT_TARGET,
  rollback:
    'none required — a failed build is never promoted to production, so the last healthy deployment keeps serving and there is no state to undo',
})

/** What the host injects: the platform's real production redeploy. */
export type RedeployFn = () => Promise<{ ok: boolean; data?: unknown; error?: string }>

export interface RetryDeploymentExecutorOptions {
  redeploy: RedeployFn
  /**
   * Optional stable id for the audit trail, so a reader can tell WHICH mechanism acted.
   * Defaults to 'deployment-recovery'.
   */
  id?: string
}

/**
 * The executor that carries out a retry.
 *
 * Declines everything else so the chain continues to the API, browser, and manual
 * executors — this is one more link, not a replacement for any of them. A thrown redeploy
 * is reported as a handled failure rather than escaping: the action was authorized and
 * attempted, and whoever authorized it needs to know it did not succeed.
 */
export function createRetryDeploymentExecutor(options: RetryDeploymentExecutorOptions): ChainExecutor {
  return {
    id: options.id ?? 'deployment-recovery',
    async attempt(request: AgentRequest): Promise<ChainAttempt> {
      if (request.action.kind !== RETRY_DEPLOYMENT_KIND) {
        return { handled: false, reason: 'not a supervisor repair action' }
      }
      if (request.action.target !== RETRY_DEPLOYMENT_TARGET) {
        return { handled: false, reason: 'no deployment-recovery mapping' }
      }

      try {
        const outcome = await options.redeploy()
        if (!outcome.ok) {
          return { handled: true, ok: false, error: outcome.error ?? 'redeploy failed' }
        }
        return { handled: true, ok: true, result: outcome.data }
      } catch (error: any) {
        return { handled: true, ok: false, error: error?.message ?? 'redeploy threw' }
      }
    },
  }
}
