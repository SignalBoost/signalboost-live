// saas/lib/supervisor/executors/api-executor.ts
//
// API execution is default-deny. Routine automatic work must match the buyer's
// explicit capability registry. Consequential work must also be registered and
// pauses unless a signed, unexpired, single-use continuation proof validates the
// exact plan contents and dispatch scope. Approval never authorizes an unknown
// capability.

import {
  apiCompatibleActions,
  executorSchemaVersion,
  type ExecutorEvidence,
  type SupervisorExecutor,
  type SupervisorExecutorInput,
  type SupervisorExecutorResult,
} from './executor-types.ts'
import type { RepairStep } from '../repair-plan-schema.ts'
import type { SerializableValue } from '../incident-schema.ts'
import { classifyStep, type DangerVerdict } from './api-danger-policy.ts'
import {
  emptyApiCapabilityRegistry,
  type ApiCapabilityRegistry,
} from './api-capability-registry.ts'
import {
  fingerprintRepairPlan,
  type ApprovalContinuationVerdict,
  type ApprovalContinuationVerifier,
} from './approval-continuation.ts'

function now() { return new Date().toISOString() }

export interface ApiStepRunner {
  (step: RepairStep, targetProvider: string): Promise<{ ok: boolean; summary: string; data?: Record<string, SerializableValue> }>
}

export interface OwnerNotifier {
  (input: { dispatchId: string; incidentId: string; step: RepairStep; verdict: DangerVerdict }): Promise<void> | void
}

const missingRunner: ApiStepRunner = async () => ({
  ok: false,
  summary: 'No API runner was configured. Execution failed closed.',
})

export interface APIExecutorOptions {
  runner?: ApiStepRunner
  notifyOwner?: OwnerNotifier
  capabilityRegistry?: ApiCapabilityRegistry
  approvalVerifier?: ApprovalContinuationVerifier
}

export class APIExecutor implements SupervisorExecutor {
  readonly kind = 'api' as const
  private readonly runner: ApiStepRunner
  private readonly notifyOwner?: OwnerNotifier
  private readonly capabilityRegistry: ApiCapabilityRegistry
  private readonly approvalVerifier?: ApprovalContinuationVerifier

  constructor(options: APIExecutorOptions = {}) {
    this.runner = options.runner ?? missingRunner
    this.notifyOwner = options.notifyOwner
    this.capabilityRegistry = options.capabilityRegistry ?? emptyApiCapabilityRegistry
    this.approvalVerifier = options.approvalVerifier
  }

  async execute(input: SupervisorExecutorInput): Promise<SupervisorExecutorResult> {
    const startedAt = now()
    const dispatchId = input.dispatch.dispatchId
    const planFingerprint = fingerprintRepairPlan(input.plan)
    const approved = new Set(input.approvedStepIds)
    const approvedSteps = input.plan.steps.filter(step => approved.has(step.stepId))

    const outOfScope = approvedSteps.find(step => !apiCompatibleActions.has(step.action))
    if (outOfScope) {
      return this.result(input, startedAt, 'rejected', [], input.approvedStepIds, [{
        evidenceId: `${dispatchId}-api-rejected`,
        type: 'api_scope_rejected',
        summary: `Approved step "${outOfScope.stepId}" (${outOfScope.action}) is not API-compatible.`,
      }], { code: 'api_scope_rejected', message: 'Approved scope is not API-compatible.' })
    }

    const executed: string[] = []
    const skipped: string[] = []
    const evidence: ExecutorEvidence[] = []
    const capabilityExecutions = new Map<string, number>()
    let continuationVerdict: ApprovalContinuationVerdict | null = null

    const validateContinuation = async (): Promise<ApprovalContinuationVerdict> => {
      if (continuationVerdict) return continuationVerdict
      if (!input.approvalContinuation) {
        continuationVerdict = { valid: false, reason: 'no approval continuation supplied' }
        return continuationVerdict
      }
      if (!this.approvalVerifier) {
        continuationVerdict = { valid: false, reason: 'approval continuation verifier is not configured' }
        return continuationVerdict
      }
      continuationVerdict = await this.approvalVerifier.verify(input.approvalContinuation, {
        incidentId: input.incident.incidentId,
        planId: input.plan.planId,
        planFingerprint,
        dispatchId,
        approvedStepIds: [...input.approvedStepIds],
      })
      return continuationVerdict
    }

    const pause = async (step: RepairStep, verdict: DangerVerdict, evidenceType = 'api_step_paused_for_approval'): Promise<SupervisorExecutorResult> => {
      try { await this.notifyOwner?.({ dispatchId, incidentId: input.incident.incidentId, step, verdict }) } catch { /* best effort */ }
      evidence.push({
        evidenceId: `${dispatchId}-${step.stepId}-paused`,
        type: evidenceType,
        summary: `Paused before "${step.stepId}": ${verdict.reason} Nothing was executed.`,
        data: {
          stepId: step.stepId,
          planFingerprint,
          category: verdict.category ?? 'destructive',
          action: step.action,
          targetProvider: input.plan.targetProvider,
        },
      })
      const index = approvedSteps.indexOf(step)
      skipped.push(...approvedSteps.slice(index).map(candidate => candidate.stepId))
      return this.result(input, startedAt, 'paused_for_approval', executed, skipped, evidence)
    }

    for (const step of approvedSteps) {
      if (step.action === 'stop') {
        evidence.push({ evidenceId: `${dispatchId}-${step.stepId}-stop`, type: 'api_stop', summary: `Stopped at step ${step.stepId} as planned.` })
        skipped.push(...approvedSteps.slice(approvedSteps.indexOf(step) + 1).map(candidate => candidate.stepId))
        break
      }

      if (step.action === 'request_approval') {
        const continuation = await validateContinuation()
        if (!continuation.valid) {
          evidence.push({
            evidenceId: `${dispatchId}-${step.stepId}-approval`,
            type: 'api_request_approval',
            summary: `Step ${step.stepId} requests owner approval before proceeding.`,
            data: { planFingerprint },
          })
          const index = approvedSteps.indexOf(step)
          skipped.push(...approvedSteps.slice(index).map(candidate => candidate.stepId))
          return this.result(input, startedAt, 'paused_for_approval', executed, skipped, evidence)
        }
        evidence.push({
          evidenceId: `${dispatchId}-${step.stepId}-approval-satisfied`,
          type: 'api_request_approval_satisfied',
          summary: `Signed approval continuation accepted for control step ${step.stepId}.`,
          data: {
            planFingerprint,
            approverId: continuation.approverId ?? 'unknown',
            previousAuditEventId: continuation.previousAuditEventId ?? 'unknown',
          },
        })
        executed.push(step.stepId)
        continue
      }

      const verdict = classifyStep(step, input.plan.targetProvider, this.capabilityRegistry)
      const capability = verdict.capabilityMatch?.capability

      if (verdict.dangerous) {
        if (!capability) return pause(step, verdict, 'api_unregistered_capability_paused')

        const continuation = await validateContinuation()
        if (!continuation.valid) return pause(step, verdict)

        evidence.push({
          evidenceId: `${dispatchId}-${step.stepId}-continuation`,
          type: 'api_approval_continuation_accepted',
          summary: `Signed approval continuation accepted for registered consequential step ${step.stepId}.`,
          data: {
            stepId: step.stepId,
            planFingerprint,
            provider: capability.provider,
            actionId: capability.actionId,
            approverId: continuation.approverId ?? 'unknown',
            previousAuditEventId: continuation.previousAuditEventId ?? 'unknown',
          },
        })
      }

      if (!capability) {
        return pause(step, {
          dangerous: true,
          category: 'destructive',
          reason: 'No registered capability matched the API request.',
          capabilityMatch: verdict.capabilityMatch,
        }, 'api_unregistered_capability_paused')
      }

      if (capability.maximumExecutionsPerDispatch !== undefined) {
        const capabilityKey = `${capability.provider}/${capability.actionId}`
        const count = capabilityExecutions.get(capabilityKey) ?? 0
        if (count >= capability.maximumExecutionsPerDispatch) {
          skipped.push(...approvedSteps.slice(approvedSteps.indexOf(step)).map(candidate => candidate.stepId))
          return this.result(input, startedAt, 'rejected', executed, skipped, evidence, {
            code: 'api_execution_limit_exceeded',
            message: `Execution limit exceeded for ${capabilityKey}.`,
          })
        }
        capabilityExecutions.set(capabilityKey, count + 1)
      }

      const run = await this.runner(step, input.plan.targetProvider)
      const execEvidence: ExecutorEvidence = {
        evidenceId: `${dispatchId}-${step.stepId}-exec`,
        type: run.ok ? 'api_step_executed' : 'api_step_failed',
        summary: `${step.stepId} (${step.action}): ${run.summary}`,
        data: { planFingerprint },
      }
      if (run.data) execEvidence.data = { ...execEvidence.data, ...run.data }
      evidence.push(execEvidence)
      if (!run.ok) {
        skipped.push(...approvedSteps.slice(approvedSteps.indexOf(step) + 1).map(candidate => candidate.stepId))
        return this.result(input, startedAt, 'failed', executed, skipped, evidence, { code: 'api_step_failed', message: `Step ${step.stepId} failed: ${run.summary}` })
      }
      executed.push(step.stepId)
    }

    return this.result(input, startedAt, 'completed', executed, skipped, evidence)
  }

  private result(
    input: SupervisorExecutorInput,
    startedAt: string,
    status: SupervisorExecutorResult['status'],
    executedStepIds: string[],
    skippedStepIds: string[],
    evidence: ExecutorEvidence[],
    error?: { code: string; message: string },
  ): SupervisorExecutorResult {
    const base: SupervisorExecutorResult = {
      dispatchId: input.dispatch.dispatchId,
      executorKind: this.kind,
      status,
      startedAt,
      completedAt: now(),
      executedStepIds,
      skippedStepIds,
      evidence,
      schemaVersion: executorSchemaVersion,
    }
    if (error) base.error = error
    return base
  }
}
