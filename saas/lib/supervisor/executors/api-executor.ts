// saas/lib/supervisor/executors/api-executor.ts
//
// The Self-Healing Supervisor's API executor. This is the real self-heal path:
// it AUTO-EXECUTES routine repair steps against already-wired providers, and it
// STOPS and pauses for the owner only on the severe categories (money,
// destructive/irreversible, credentials/security) — see api-danger-policy.ts.
//
// Two safety properties hold no matter what plan arrives:
//   1) The danger gate is hard-coded and fail-safe (api-danger-policy). The model
//      that produced the plan cannot widen what auto-executes.
//   2) Real execution runs ONLY through an injected provider runner that drives
//      already-registered providers (universalRunner + provider_registry). The
//      executor cannot invent a new capability; it can only call what the owner
//      already wired, with the platform's own credential resolution.
//
// If a dangerous step is reached, execution stops there: nothing after a gate runs
// in the same pass, so a plan cannot slip a dangerous step through behind safe ones.

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

function now() { return new Date().toISOString() }

// A single provider call. Returns ok + a sanitized summary; never throws to the
// caller (a thrown provider error becomes ok:false so the executor can fail the
// step cleanly rather than crash the dispatch).
export interface ApiStepRunner {
  (step: RepairStep, targetProvider: string): Promise<{ ok: boolean; summary: string; data?: Record<string, SerializableValue> }>
}

// Owner notification for a paused (dangerous) step. Best-effort; a notify failure
// never changes the executor's decision to pause.
export interface OwnerNotifier {
  (input: { dispatchId: string; incidentId: string; step: RepairStep; verdict: DangerVerdict }): Promise<void> | void
}

// Default runner: routes an api_request step through the universal provider engine,
// so it executes only registered providers with backend credential resolution.
// Imported lazily so this module stays free of network/provider deps until used
// (keeps it loadable in tests and in the Sprint-14 routing contexts).
const defaultRunner: ApiStepRunner = async (step, targetProvider) => {
  try {
    const { runUniversalProvider } = await import('@/lib/engine/universalRunner')
    const p = (step.parameters || {}) as Record<string, SerializableValue>
    const actionId = typeof p.actionId === 'string' ? p.actionId
      : typeof p.action_id === 'string' ? p.action_id
      : step.action
    const result = await runUniversalProvider({
      providerId: targetProvider,
      actionId,
      variables: p as Record<string, unknown>,
    })
    return {
      ok: Boolean((result as { ok?: boolean }).ok),
      summary: (result as { ok?: boolean }).ok ? `Provider ${targetProvider}/${actionId} responded ok.` : `Provider ${targetProvider}/${actionId} returned not-ok.`,
    }
  } catch (err) {
    return { ok: false, summary: `Provider call failed: ${err instanceof Error ? err.message : 'unknown error'}` }
  }
}

export class APIExecutor implements SupervisorExecutor {
  readonly kind = 'api' as const
  private readonly runner: ApiStepRunner
  private readonly notifyOwner?: OwnerNotifier

  constructor(options: { runner?: ApiStepRunner; notifyOwner?: OwnerNotifier } = {}) {
    this.runner = options.runner ?? defaultRunner
    this.notifyOwner = options.notifyOwner
  }

  async execute(input: SupervisorExecutorInput): Promise<SupervisorExecutorResult> {
    const startedAt = now()
    const dispatchId = input.dispatch.dispatchId
    const approved = new Set(input.approvedStepIds)
    const approvedSteps = input.plan.steps.filter(step => approved.has(step.stepId))

    // Scope gate: every approved step must be API-compatible. A non-API step here
    // is a routing error upstream; reject the whole dispatch, execute nothing.
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

    for (const step of approvedSteps) {
      // request_approval / stop are control steps, not provider calls.
      if (step.action === 'stop') {
        evidence.push({ evidenceId: `${dispatchId}-${step.stepId}-stop`, type: 'api_stop', summary: `Stopped at step ${step.stepId} as planned.` })
        skipped.push(...approvedSteps.slice(approvedSteps.indexOf(step) + 1).map(s => s.stepId))
        break
      }

      const verdict = classifyStep(step, input.plan.targetProvider)

      if (verdict.dangerous) {
        // Severe category: do NOT execute. Pause the dispatch here and notify the
        // owner. Nothing after this step runs in this pass.
        try { await this.notifyOwner?.({ dispatchId, incidentId: input.incident.incidentId, step, verdict }) } catch { /* notify is best-effort */ }
        evidence.push({
          evidenceId: `${dispatchId}-${step.stepId}-paused`,
          type: 'api_step_paused_for_approval',
          summary: `Paused before "${step.stepId}": ${verdict.reason} Awaiting owner approval; nothing was executed.`,
          data: { stepId: step.stepId, category: verdict.category ?? 'destructive', action: step.action, targetProvider: input.plan.targetProvider },
        })
        const idx = approvedSteps.indexOf(step)
        skipped.push(...approvedSteps.slice(idx).map(s => s.stepId))
        return this.result(input, startedAt, 'paused_for_approval', executed, skipped, evidence)
      }

      // request_approval is itself a request-a-human step; treat as a benign pause
      // marker that does not call a provider.
      if (step.action === 'request_approval') {
        evidence.push({ evidenceId: `${dispatchId}-${step.stepId}-approval`, type: 'api_request_approval', summary: `Step ${step.stepId} requests owner approval before proceeding.` })
        const idx = approvedSteps.indexOf(step)
        skipped.push(...approvedSteps.slice(idx).map(s => s.stepId))
        return this.result(input, startedAt, 'paused_for_approval', executed, skipped, evidence)
      }

      // Safe step: execute for real through the injected runner.
      const run = await this.runner(step, input.plan.targetProvider)
      const execEvidence: ExecutorEvidence = {
        evidenceId: `${dispatchId}-${step.stepId}-exec`,
        type: run.ok ? 'api_step_executed' : 'api_step_failed',
        summary: `${step.stepId} (${step.action}): ${run.summary}`,
      }
      if (run.data) execEvidence.data = run.data
      evidence.push(execEvidence)
      if (!run.ok) {
        // A failed provider call stops the run and fails the dispatch — a partial
        // repair must never be reported as success.
        skipped.push(...approvedSteps.slice(approvedSteps.indexOf(step) + 1).map(s => s.stepId))
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
    // Only attach `error` when present — an explicit `error: undefined` is not
    // plain-serializable and the dispatcher rejects the whole result.
    if (error) base.error = error
    return base
  }
}
