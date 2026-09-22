// saas/platform-harness/runtime/governed-executor.ts
//
// Adapter over the existing Agent Gateway Governed Socket. The Platform Harness
// does not recreate governance; every executable action still calls runGoverned().

import { runGoverned } from '../../agent-gateway/governance.ts'
import type {
  AgentRequest,
  GatewayHost,
  GatewayOutcome,
  GovernancePolicy,
} from '../../agent-gateway/types.ts'
import type { HarnessManifest } from '../core/types.ts'

export interface HarnessAction {
  actionId: string
  kind: string
  capabilityId: string
  params?: Record<string, unknown>
}

export type HarnessActionStatus =
  | 'executed'
  | 'execution_failed'
  | 'authority_boundary'

export interface HarnessActionResult {
  actionId: string
  capabilityId: string
  status: HarnessActionStatus
  gatewayOutcome?: GatewayOutcome
  error?: string
}

export interface GovernedHarnessExecutor {
  execute(manifest: HarnessManifest, action: HarnessAction): Promise<HarnessActionResult>
}

export function createGovernedHarnessExecutor(input: {
  policy: GovernancePolicy
  host: GatewayHost
}): GovernedHarnessExecutor {
  return Object.freeze({
    async execute(
      manifest: HarnessManifest,
      action: HarnessAction,
    ): Promise<HarnessActionResult> {
      const capability = manifest.capabilities.find(item => item.id === action.capabilityId)
      if (!capability) {
        return Object.freeze({
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'authority_boundary',
          error: 'harness_capability_not_in_resolved_manifest',
        })
      }

      const request: AgentRequest = {
        requestId: `${manifest.runId}:${action.actionId}`,
        protocol: 'itmounts-harness',
        agentId: manifest.identity.agentId,
        ...(manifest.identity.tenantId ? { tenantId: manifest.identity.tenantId } : {}),
        action: {
          kind: action.kind,
          target: action.capabilityId,
          params: {
            ...(action.params ?? {}),
            _harness: {
              runId: manifest.runId,
              profile: manifest.profile,
              environmentId: manifest.environment.environmentId,
              environmentClass: manifest.environment.class,
              authorityManifestRef: manifest.authorityManifestRef,
            },
          },
        },
      }

      const outcome = await runGoverned(request, input.policy, input.host)

      if (outcome.verdict !== 'execute') {
        return Object.freeze({
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'authority_boundary',
          gatewayOutcome: outcome,
        })
      }

      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: outcome.ok ? 'executed' : 'execution_failed',
        gatewayOutcome: outcome,
        ...(outcome.error ? { error: outcome.error } : {}),
      })
    },
  })
}
