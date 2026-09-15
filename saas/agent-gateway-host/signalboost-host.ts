// saas/agent-gateway-host/signalboost-host.ts
// SignalBoost-specific live wiring. Governance decides; this file only assembles real adapters.

import { stageInfrastructurePR } from '@/lib/hub/pr-engine'
import { runUniversalProvider } from '@/lib/engine/universalRunner'
import { createInfraPr } from '@/lib/infra-pr/store'
import { triggerProductionRedeploy } from '@/lib/infra-pr/redeploy'
import { getAdminSupabase } from '@/utils/supabase/server'

import type { GatewayHost } from '../agent-gateway/index.ts'
import { createInfraPrApprovalPort } from './infra-pr-approvals.ts'
import { createPrEngineApprovalPort } from './pr-engine-approvals.ts'
import type { ApprovableAction } from './pr-engine-approvals.ts'
import { SUPERVISOR_REPAIR_ACTIONS } from './supervisor-actions.ts'
import { createRetryDeploymentExecutor } from './deployment-recovery.ts'
import { createCosQualityRecoveryExecutor } from './cos-quality-recovery.ts'
import {
  createObservationPolicyRecoveryExecutor,
  reconcileObservationPolicy,
} from './observation-policy-recovery.ts'
import { GATEWAY_ALLOWLIST, GATEWAY_POLICY } from './gateway-policy.ts'
import { createExecutionChain, createUniversalChainExecutor, createBrowserChainExecutor } from './execution-chain.ts'
import type { ExecutableAction } from './universal-execution.ts'

export { GATEWAY_ALLOWLIST, GATEWAY_POLICY } from './gateway-policy.ts'

// Generic API actions remain closed. Specialized recovery executors below each accept one exact
// reviewed target and decline everything else.
export const API_ACTIONS: readonly ExecutableAction[] = []
export const APPROVABLE_ACTIONS: readonly ApprovableAction[] = SUPERVISOR_REPAIR_ACTIONS

export function createSignalBoostGatewayHost(): GatewayHost {
  const holdingPen = createInfraPrApprovalPort({ createInfraPr })
  return {
    execution: createExecutionChain({
      executors: [
        createCosQualityRecoveryExecutor(),
        createObservationPolicyRecoveryExecutor({
          reconcile: () => reconcileObservationPolicy(getAdminSupabase()),
        }),
        createRetryDeploymentExecutor({
          // Self-Healing may only claim a later production outcome when the initiating repair names
          // the exact deployment it created. A deploy hook without exact identity fails closed here.
          redeploy: () => triggerProductionRedeploy({ requireExactIdentity: true }),
        }),
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
