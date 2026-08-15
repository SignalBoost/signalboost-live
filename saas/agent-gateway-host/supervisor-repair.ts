// saas/agent-gateway-host/supervisor-repair.ts
//
// THE ACTUATION BRIDGE — the piece that lets self-healing actually heal.
//
// The autonomous supervisor already detects an incident, diagnoses it, and writes a
// validated repair_plan with a matching rollback_plan. Then it throws that plan away:
// stageApprovedInvestigation() stages one hardcoded read-only step (vercel.view_env,
// inspection_only) and nothing else ever happens. Detection and diagnosis are autonomous;
// recovery is not. This module closes that gap by running each repair step through the
// governed socket — so a step either executes (allowlisted, reversible, rollback verified)
// or becomes a PR the owner merges. Nothing new is trusted; the existing gates decide.
//
// FOUR RULES, all of which can only ever make a step SAFER than the diagnosis asked for:
//
//  1. requires_approval FORCES A HALT. If the diagnosis marked a step as needing approval,
//     it is human-gated no matter what the classifier says and no matter what the allowlist
//     contains. The model's caution can raise the bar; it can never lower it.
//  2. executor 'human' is never machine-dispatched. The diagnosis already decided a person
//     must do it.
//  3. AN UNRECOGNIZED ACTION IS NOT EXECUTABLE. repair_plan.action is model-written prose.
//     Prose must never become an executable target, so a host-supplied resolver has to map
//     a step onto a known action id; anything it does not recognize gets a sentinel target
//     that classifies as 'unknown' and halts. The resolver ships EMPTY — today every step
//     halts into a PR, which is strictly better than today's behavior of discarding the
//     plan entirely.
//  4. STOP ON FIRST NON-EXECUTION. Repair steps are ordered and later steps assume earlier
//     ones succeeded. If step 2 halts for approval, step 3 must not run against a
//     half-repaired system.

import type {
  AgentRequest,
  GatewayHost,
  GatewayOutcome,
  GovernancePolicy,
} from '../agent-gateway/index.ts'
import { runGoverned } from '../agent-gateway/index.ts'

/** Mirrors the executor enum in lib/cos/supervisor-thinker-prompt.ts. */
export type SupervisorExecutor = 'api_executor' | 'code_agent' | 'cli_executor' | 'ui_agent' | 'human'

/** Mirrors one entry of the validated repair_plan. */
export interface RepairStep {
  step: number
  action: string
  executor: SupervisorExecutor
  target: string
  expected_result: string
  requires_approval: boolean
}

/** The incident fields this bridge needs. Kept minimal so it does not import the supervisor. */
export interface RepairIncident {
  incident_id: string
  project: string
  provider?: string
}

export type RepairActionResolver = (step: RepairStep, incident: RepairIncident) => string | null
export type RepairParamResolver = (
  step: RepairStep,
  incident: RepairIncident,
) => Readonly<Record<string, unknown>>

export const resolveNothing: RepairActionResolver = () => null
export const UNRECOGNIZED_TARGET = 'unrecognized_repair_action'

export interface DispatchRepairPlanOptions {
  incident: RepairIncident
  repairPlan: readonly RepairStep[]
  policy: GovernancePolicy
  host: GatewayHost
  /** Stable identity for one detected remediation attempt. Replays reuse it; later attempts do not. */
  executionAttemptId?: string
  resolveAction?: RepairActionResolver
  resolveParams?: RepairParamResolver
  agentId?: string
}

export interface RepairStepOutcome {
  step: number
  action: string
  resolvedTarget: string | null
  outcome: GatewayOutcome
}

export interface DispatchRepairPlanResult {
  completed: boolean
  results: readonly RepairStepOutcome[]
  stoppedAt?: { step: number; reason: string }
}

function safeAttemptId(value: unknown): string {
  return String(value ?? '').replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 180)
}

export function repairStepToRequest(
  incident: RepairIncident,
  step: RepairStep,
  resolvedTarget: string | null,
  agentId: string,
  extraParams: Readonly<Record<string, unknown>> = {},
  executionAttemptId?: string,
): AgentRequest {
  const attemptId = safeAttemptId(executionAttemptId)
  return {
    requestId: `${incident.incident_id}:repair:${step.step}${attemptId ? `:attempt:${attemptId}` : ''}`,
    protocol: 'supervisor',
    agentId,
    action: {
      kind: 'supervisor_repair',
      target: resolvedTarget ?? UNRECOGNIZED_TARGET,
      params: {
        incidentId: incident.incident_id,
        project: incident.project,
        stepNumber: step.step,
        ...(attemptId ? { executionAttemptId: attemptId } : {}),
        describedAction: step.action,
        describedTarget: step.target,
        expectedResult: step.expected_result,
        executor: step.executor,
        requiresApproval: step.requires_approval,
        ...extraParams,
      },
    },
  }
}

export async function dispatchRepairPlan(
  options: DispatchRepairPlanOptions,
): Promise<DispatchRepairPlanResult> {
  const resolve = options.resolveAction ?? resolveNothing
  const agentId = options.agentId ?? 'autonomous-supervisor'
  const results: RepairStepOutcome[] = []
  const ordered = [...options.repairPlan].sort((a, b) => a.step - b.step)

  for (const step of ordered) {
    const forcedHuman = step.requires_approval || step.executor === 'human'
    const resolvedTarget = forcedHuman ? null : resolve(step, options.incident)
    const extraParams = options.resolveParams ? options.resolveParams(step, options.incident) : {}
    const request = repairStepToRequest(options.incident, step, resolvedTarget, agentId, extraParams, options.executionAttemptId)
    const outcome = await runGoverned(request, options.policy, options.host)
    results.push({ step: step.step, action: step.action, resolvedTarget, outcome })
    if (outcome.verdict !== 'execute' || !outcome.ok) {
      return {
        completed: false,
        results,
        stoppedAt: {
          step: step.step,
          reason: outcome.verdict === 'execute'
            ? `step ${step.step} failed: ${outcome.error ?? 'execution failed'}`
            : `step ${step.step} ${outcome.verdict}: ${outcome.reason}`,
        },
      }
    }
  }
  return { completed: true, results }
}
