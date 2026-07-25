// saas/agent-gateway-host/signalboost-host.ts
//
// THE WIRING. Everything else in this directory is adapters proven against fakes; this is
// the one file that reaches the real systems, and the only one that cannot be node-tested
// (lib/hub/pr-engine and lib/engine/universalRunner both touch Supabase at module load).
// It stays deliberately thin: assemble, never decide. All the judgement lives in the
// adapters and in the governance core.
//
// Automation first, human as the backstop:
//   ExecutionPort → api → browser → manual
//   ApprovalPort  → template-mapped halts become OPEN cockpit PRs; unmapped halts fall back
//                   to the durable holding pen.
//
// SignalBoost-specific by design. A buyer deletes this file and writes their own.

import { stageInfrastructurePR } from '@/lib/hub/pr-engine'
import { runUniversalProvider } from '@/lib/engine/universalRunner'
import { createInfraPr } from '@/lib/infra-pr/store'
import { triggerProductionRedeploy } from '@/lib/infra-pr/redeploy'

import type { GatewayHost } from '../agent-gateway/index.ts'
import { createInfraPrApprovalPort } from './infra-pr-approvals.ts'
import { createPrEngineApprovalPort } from './pr-engine-approvals.ts'
import type { ApprovableAction } from './pr-engine-approvals.ts'
import { SUPERVISOR_REPAIR_ACTIONS } from './supervisor-actions.ts'
import { createRetryDeploymentExecutor } from './deployment-recovery.ts'
import { GATEWAY_ALLOWLIST, GATEWAY_POLICY } from './gateway-policy.ts'
import {
  createExecutionChain,
  createUniversalChainExecutor,
  createBrowserChainExecutor,
} from './execution-chain.ts'
import type { ExecutableAction } from './universal-execution.ts'

export { GATEWAY_ALLOWLIST, GATEWAY_POLICY } from './gateway-policy.ts'

// Actions the gateway may execute directly via the provider API, once allowlisted above.
// A closed map: an action absent here cannot run, no matter what clears governance.
export const API_ACTIONS: readonly ExecutableAction[] = []

// Actions that can become a cockpit PR. Each needs a REGISTERED provider template id
// (see lib/hub/provider-templates*.ts) — pr-engine rejects unregistered ids.
//
// The supervisor's proposed repairs are here so a halted repair reaches the Infrastructure
// PR cockpit the owner already uses, instead of the holding-pen table nothing reads. Both
// entries stage a READ-ONLY step; see supervisor-actions.ts for why nothing executable is
// mapped yet.
export const APPROVABLE_ACTIONS: readonly ApprovableAction[] = SUPERVISOR_REPAIR_ACTIONS

/**
 * Assemble the live SignalBoost gateway host.
 *
 * The browser executor is registered but has no execution host wired: Chromium cannot run in
 * a serverless function, so it declines every action with a stated reason rather than
 * queueing work that would never run. Supply runBrowserAction once a worker or hosted
 * browser exists and that link starts carrying traffic with no other change.
 */
export function createSignalBoostGatewayHost(): GatewayHost {
  const holdingPen = createInfraPrApprovalPort({ createInfraPr })

  return {
    execution: createExecutionChain({
      executors: [
        // First: the one action the envelope authorizes. Declines everything else.
        createRetryDeploymentExecutor({ redeploy: triggerProductionRedeploy }),
        createUniversalChainExecutor({
          runUniversalProvider: async (input) => {
            const r = await runUniversalProvider(input)
            return { ok: r.ok, status: r.status, outputs: r.outputs, error: r.error }
          },
          actions: API_ACTIONS,
        }),
        createBrowserChainExecutor({ actions: [] }),
      ],
    }),
    approvals: createPrEngineApprovalPort({
      stageInfrastructurePr: async (input) => {
        const r = await stageInfrastructurePR(input)
        return { ok: r.ok, pr: r.pr ? { id: r.pr.id } : undefined, error: r.error, duplicate: r.duplicate }
      },
      actions: APPROVABLE_ACTIONS,
      fallback: holdingPen,
    }),
  }
}
