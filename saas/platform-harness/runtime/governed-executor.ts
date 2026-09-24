// saas/platform-harness/runtime/governed-executor.ts
//
// Adapter over the existing Agent Gateway Governed Socket. The Platform Harness
// does not recreate governance; every executable action still calls runGoverned().

import { runGoverned } from '../../agent-gateway/governance.ts'
import type {
  AgentRequest,
  GatewayExecutionControl,
  GatewayHost,
  GatewayOutcome,
  GovernancePolicy,
} from '../../agent-gateway/types.ts'
import type { HarnessManifest } from '../core/types.ts'

export interface HarnessCompensationOutcome {
  ok: boolean
  evidenceRefs?: readonly string[]
  error?: string
}

/**
 * Universal compensation contract. In staging/production every mutating action must declare one:
 * - compensate: an executable undo the Harness runs (reverse order) if the run does not verify;
 * - delegated: the effect is a governed child HarnessRun that owns its own compensation;
 * - irreversible: no undo exists; only allowed under an explicitly consequential grant, which the
 *   Governed Socket routes to human approval.
 * The contract is host-side only and is never sent to the governed action as params.
 */
export type HarnessCompensation =
  | Readonly<{
      mode: 'compensate'
      compensationId: string
      /** Must be idempotent/no-op safe: a timed-out mutation can have an uncertain remote outcome. */
      run(): Promise<HarnessCompensationOutcome>
    }>
  | Readonly<{ mode: 'delegated'; reason: string }>
  | Readonly<{ mode: 'irreversible'; reason: string }>

export interface HarnessAction {
  actionId: string
  kind: string
  capabilityId: string
  params?: Record<string, unknown>
  /** Evidence proving the consequential action's required pre-state before execution. */
  preconditionEvidenceRefs?: readonly string[]
  compensation?: HarnessCompensation
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
  evidenceRefs?: readonly string[]
  error?: string
}

export interface GovernedHarnessExecutor {
  execute(
    manifest: HarnessManifest,
    action: HarnessAction,
    control?: GatewayExecutionControl,
  ): Promise<HarnessActionResult>
}

export function createGovernedHarnessExecutor(input: {
  policy: GovernancePolicy
  host: GatewayHost
}): GovernedHarnessExecutor {
  return Object.freeze({
    async execute(
      manifest: HarnessManifest,
      action: HarnessAction,
      control?: GatewayExecutionControl,
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
              ...(manifest.deadlineAt ? { deadlineAt: manifest.deadlineAt } : {}),
            },
          },
        },
      }

      const outcome = await runGoverned(request, input.policy, input.host, control)

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
        ...(outcome.evidenceRefs?.length ? { evidenceRefs: [...outcome.evidenceRefs] } : {}),
        ...(outcome.error ? { error: outcome.error } : {}),
      })
    },
  })
}
