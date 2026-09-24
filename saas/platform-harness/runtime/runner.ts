// saas/platform-harness/runtime/runner.ts
import type {
  HarnessCompensationSummary,
  HarnessManifest,
  HarnessObservableEvent,
  HarnessRunResult,
  HarnessVerificationResult,
} from '../core/types.ts'
import { classifyHarnessResult } from '../core/failure-router.ts'
import type { HarnessCapabilityResolverPort } from '../capabilities/resolver.ts'
import { createTrajectoryJournal } from '../evidence/trajectory-journal.ts'
import type {
  GovernedHarnessExecutor,
  HarnessAction,
  HarnessActionResult,
  HarnessCompensation,
  HarnessCompensationOutcome,
} from './governed-executor.ts'
import type { HarnessCostBudgetPort } from './cost-budget.ts'
import {
  normalizeHarnessVerification,
  type HarnessTrajectoryVerifier,
} from '../verification/outcome-verifier.ts'
import { currentHarnessExecutionContext, withHarnessExecutionContext } from './execution-context.ts'

export interface HarnessRunPlan {
  actions: readonly HarnessAction[]
}

export interface HarnessOutcomeVerifier {
  verify(manifest: HarnessManifest): Promise<HarnessVerificationResult>
}

function diagnosticFailureCode(
  verification: HarnessVerificationResult,
  fallback: string,
): string {
  const raw=String(verification.reason??'').trim()
  if(!raw) return fallback
  return raw
    .replace(/\b(bearer|token|secret|api[_-]?key)\b\s*[:=]?\s*[^,;\s]+/gi,'$1=[redacted]')
    .replace(/\s+/g,' ')
    .slice(0,500)
}

const HARNESS_COMPENSATION_TIMEOUT_MS = 30_000

type HarnessCompensationEntry = {
  actionId: string
  capabilityId: string
  compensation: Extract<HarnessCompensation, { mode: 'compensate' }>
}

type HarnessManualRecoveryEntry = {
  actionId: string
  capabilityId: string
  reason: string
}

type HarnessJournal = ReturnType<typeof createTrajectoryJournal>

/**
 * Universal compensation contract check. Returns a failure code, or null when the action may run.
 * Only staging/production mutating actions are bound; read-only and sandbox work is unaffected.
 */
export function harnessCompensationContractViolation(
  manifest: HarnessManifest,
  action: HarnessAction,
): string | null {
  const grant = manifest.capabilities.find(item => item.id === action.capabilityId)
  if (!grant) return null
  const risk = grant.risk ?? (grant.mutating ? 'write' : 'read')
  if (
    risk === 'consequential'
    && !(action.preconditionEvidenceRefs ?? []).some(value => String(value ?? '').trim())
  ) {
    return 'harness_consequential_precondition_evidence_required'
  }
  if (!grant.mutating) return null
  const environmentClass = manifest.environment.class
  if (environmentClass !== 'production' && environmentClass !== 'staging') return null
  const compensation = action.compensation
  if (!compensation) return 'harness_compensation_contract_required'
  if (compensation.mode === 'compensate') {
    return typeof compensation.run === 'function' && String(compensation.compensationId ?? '').trim()
      ? null
      : 'harness_compensation_contract_invalid'
  }
  if (compensation.mode !== 'delegated' && compensation.mode !== 'irreversible') {
    return 'harness_compensation_contract_invalid'
  }
  if (!String(compensation.reason ?? '').trim()) return 'harness_compensation_contract_invalid'
  if (compensation.mode === 'irreversible' && risk !== 'consequential') {
    return 'harness_irreversible_action_requires_consequential_grant'
  }
  return null
}

async function runOneCompensation(entry: HarnessCompensationEntry): Promise<HarnessCompensationOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<HarnessCompensationOutcome>(resolve => {
      timer = setTimeout(
        () => resolve({ ok: false, error: 'harness_compensation_timeout' }),
        HARNESS_COMPENSATION_TIMEOUT_MS,
      )
    })
    const outcome = await Promise.race([entry.compensation.run(), timeout])
    return outcome && typeof outcome === 'object'
      ? outcome
      : { ok: false, error: 'harness_compensation_invalid_result' }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 300) : 'harness_compensation_failed',
    }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** Saga rollback: undo executed compensable actions in reverse order, journaling every step. */
async function runHarnessCompensations(
  journal: HarnessJournal,
  stack: readonly HarnessCompensationEntry[],
  manualRecovery: readonly HarnessManualRecoveryEntry[] = [],
): Promise<HarnessCompensationSummary> {
  let completed = 0
  const failedActionIds: string[] = []
  for (const entry of [...stack].reverse()) {
    const outcome = await runOneCompensation(entry)
    if (outcome.ok) completed += 1
    else failedActionIds.push(entry.actionId)
    journal.append({
      kind: 'rollback',
      summary: outcome.ok
        ? `Compensation completed for ${entry.capabilityId}.`
        : `Compensation failed for ${entry.capabilityId}.`,
      ...(outcome.evidenceRefs?.length ? { evidenceRefs: [...outcome.evidenceRefs] } : {}),
      data: {
        actionId: entry.actionId,
        capabilityId: entry.capabilityId,
        compensationId: entry.compensation.compensationId,
        ok: outcome.ok,
        ...(outcome.ok ? {} : { error: String(outcome.error ?? 'harness_compensation_failed').slice(0, 300) }),
      },
    })
  }
  for (const entry of manualRecovery) {
    journal.append({
      kind: 'escalation',
      summary: 'Manual recovery is required because the action has no safe executable compensation.',
      data: {
        actionId: entry.actionId,
        capabilityId: entry.capabilityId,
        reason: entry.reason.slice(0, 300),
      },
    })
  }
  const status = manualRecovery.length
    ? 'manual_recovery_required'
    : !stack.length
      ? 'not_required'
      : completed === stack.length
        ? 'completed'
        : completed === 0
          ? 'failed'
          : 'partial'
  return Object.freeze({
    status,
    attempted: stack.length,
    completed,
    failedActionIds: Object.freeze(failedActionIds),
    ...(manualRecovery.length
      ? { manualRecoveryActionIds: Object.freeze([...new Set(manualRecovery.map(entry => entry.actionId))]) }
      : {}),
  })
}

/**
 * Deterministic plan runner retained for simple callers.
 * Execution failures without independent attribution remain harness failures.
 */
export async function runHarness(input: {
  manifest: HarnessManifest
  plan: HarnessRunPlan
  executor: GovernedHarnessExecutor
  verifier: HarnessOutcomeVerifier
}): Promise<HarnessRunResult> {
  const { manifest } = input
  const journal = createTrajectoryJournal(manifest.runId)
  journal.append({
    kind: 'run_started',
    summary: 'Harness run started',
    evidenceRefs: [manifest.authorityManifestRef],
  })

  let productionMutationObserved = false
  const compensations: HarnessCompensationEntry[] = []
  const finish = async (result: HarnessRunResult): Promise<HarnessRunResult> => {
    if (result.outcome.status === 'success') return result
    const compensation = await runHarnessCompensations(journal, compensations)
    return { ...result, trajectory: journal.snapshot(), compensation }
  }
  for (const action of input.plan.actions) {
    const grant = manifest.capabilities.find(item => item.id === action.capabilityId)
    if (!grant) {
      journal.append({
        kind: 'failure',
        summary: 'Action capability is outside resolved manifest',
        data: { actionId: action.actionId, capabilityId: action.capabilityId },
      })
      return finish({
        runId: manifest.runId,
        profile: manifest.profile,
        trajectory: journal.snapshot(),
        outcome: { status: 'authority_halt', failureCode: 'capability_outside_manifest' },
        authorityExpanded: false,
        productionMutationObserved,
      })
    }

    const contractViolation = harnessCompensationContractViolation(manifest, action)
    if (contractViolation) {
      journal.append({
        kind: 'failure',
        summary: 'Mutating action has no valid compensation contract',
        data: { actionId: action.actionId, capabilityId: action.capabilityId, code: contractViolation },
      })
      return finish({
        runId: manifest.runId,
        profile: manifest.profile,
        trajectory: journal.snapshot(),
        outcome: { status: 'harness_failure', failureCode: contractViolation },
        authorityExpanded: false,
        productionMutationObserved,
      })
    }

    journal.append({
      kind: 'tool_call',
      summary: 'Governed action requested',
      data: { actionId: action.actionId, capabilityId: action.capabilityId },
    })
    const result = await input.executor.execute(manifest, action)

    if (result.status === 'authority_boundary') {
      journal.append({
        kind: 'escalation',
        summary: 'Governed Socket halted action at authority boundary',
        data: { actionId: action.actionId, capabilityId: action.capabilityId },
      })
      return finish({
        runId: manifest.runId,
        profile: manifest.profile,
        trajectory: journal.snapshot(),
        outcome: {
          status: 'authority_halt',
          failureCode: 'governed_socket_authority_boundary',
        },
        authorityExpanded: false,
        productionMutationObserved,
      })
    }

    if (result.status === 'execution_failed') {
      journal.append({
        kind: 'failure',
        summary: 'Governed action execution failed without independent attribution',
        data: {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'harness_failure',
        },
      })
      return finish({
        runId: manifest.runId,
        profile: manifest.profile,
        trajectory: journal.snapshot(),
        outcome: {
          status: 'harness_failure',
          failureCode: result.error ?? 'governed_action_failed',
        },
        authorityExpanded: false,
        productionMutationObserved,
      })
    }

    if (manifest.environment.class === 'production' && grant.mutating) {
      productionMutationObserved = true
    }
    if (action.compensation?.mode === 'compensate') {
      compensations.push({ actionId: action.actionId, capabilityId: action.capabilityId, compensation: action.compensation })
    }
    journal.append({
      kind: 'tool_result',
      summary: 'Governed action completed',
      data: { actionId: action.actionId, capabilityId: action.capabilityId },
    })
  }

  const verification = normalizeHarnessVerification(await input.verifier.verify(manifest))
  journal.append({
    kind: 'verification',
    summary: verification.verified
      ? 'Outcome independently verified'
      : 'Outcome verification failed',
    evidenceRefs: verification.evidenceRefs,
    data: {
      verifierRef: verification.verifierRef,
      failureAttribution: verification.failureAttribution ?? null,
    },
  })

  const classification = verification.verified
    ? classifyHarnessResult({ verification })
    : verification.failureAttribution === 'infrastructure'
      ? classifyHarnessResult({ infrastructureFailure: true, verification })
      : verification.failureAttribution === 'competency'
        ? classifyHarnessResult({ agentCompetencyFailure: true, verification })
        : verification.failureAttribution === 'authority'
          ? classifyHarnessResult({ authorityBoundaryReached: true, verification })
          : classifyHarnessResult({ executionCompleted: true, verification })

  journal.append({
    kind: 'run_finished',
    summary: classification.status === 'success'
      ? 'Harness run finished with verified success'
      : `Harness run routed to ${classification.destination}`,
  })

  return finish({
    runId: manifest.runId,
    profile: manifest.profile,
    trajectory: journal.snapshot(),
    outcome: {
      status: classification.status,
      verifierRef: verification.verifierRef,
      ...(classification.status === 'success'
        ? {}
        : { failureCode: diagnosticFailureCode(verification,classification.reason) }),
    },
    authorityExpanded: false,
    productionMutationObserved,
  })
}

export interface HarnessWorkerContext {
  manifest: HarnessManifest
  capabilities: Awaited<ReturnType<HarnessCapabilityResolverPort['resolve']>>['resolved']
  signal: AbortSignal
  deadlineAt?: string
  remainingMs(): number | null
  execute(action: HarnessAction): Promise<HarnessActionResult>
  observe(input: {
    summary: string
    evidenceRefs?: readonly string[]
    data?: Readonly<Record<string, unknown>>
  }): HarnessObservableEvent
}

export interface HarnessWorkerPort {
  run(context: HarnessWorkerContext): Promise<void>
}

function parseAbsoluteDeadline(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function effectiveDeadlineAtMs(manifest: HarnessManifest, startedAt: number): number | null {
  const candidates: number[] = []
  const absolute = parseAbsoluteDeadline(manifest.deadlineAt)
  if (absolute !== null) candidates.push(absolute)
  const duration = Number(manifest.limits.deadlineMs)
  if (Number.isFinite(duration) && duration >= 0) candidates.push(startedAt + duration)
  return candidates.length ? Math.min(...candidates) : null
}

function deadlineError(): Error {
  return new Error('harness_deadline_exceeded')
}

function isDeadlineError(error: unknown): boolean {
  return error instanceof Error && error.message === 'harness_deadline_exceeded'
}

/**
 * Shared live-worker runner for COS/Specialists/Builder.
 *
 * Capability resolution is mandatory before the worker receives capabilities. The resolver may be
 * Provider Hub, native host capabilities, or a bounded composition of both. One absolute deadline
 * controls discovery, spend reservation, governed actions, model/provider work reached through the
 * execution context, worker orchestration, and independent verification. Child runs may only shorten
 * that deadline. The worker cannot widen its manifest, and failure attribution belongs to the
 * independent trajectory verifier.
 */
export async function runHarnessWorker(input: {
  manifest: HarnessManifest
  capabilities: HarnessCapabilityResolverPort
  executor: GovernedHarnessExecutor
  worker: HarnessWorkerPort
  verifier: HarnessTrajectoryVerifier
  costBudget?: HarnessCostBudgetPort
  now?: () => Date
}): Promise<HarnessRunResult> {
  const now = input.now ?? (() => new Date())
  const startedAt = now().getTime()
  const requestedAbsolute = input.manifest.deadlineAt
  if (requestedAbsolute && parseAbsoluteDeadline(requestedAbsolute) === null) {
    return {
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: Object.freeze([]),
      outcome: { status: 'harness_failure', failureCode: 'harness_deadline_invalid' },
      authorityExpanded: false,
      productionMutationObserved: false,
    }
  }

  const deadlineAtMs = effectiveDeadlineAtMs(input.manifest, startedAt)
  const runtimeManifest: HarnessManifest = deadlineAtMs === null
    ? input.manifest
    : Object.freeze({
        ...input.manifest,
        deadlineAt: new Date(deadlineAtMs).toISOString(),
      })
  const journal = createTrajectoryJournal(runtimeManifest.runId, now)
  const actionResults: HarnessActionResult[] = []
  const controller = new AbortController()
  const parentExecution = currentHarnessExecutionContext()
  const parentAbort = () => controller.abort()
  if (parentExecution?.signal.aborted) controller.abort()
  else parentExecution?.signal.addEventListener('abort', parentAbort, { once: true })

  let toolCalls = 0
  let activeExecutions = 0
  let maxConcurrentObserved = 0
  let reservedCostUsd = 0
  let authorityBoundaryReached = false
  let productionMutationObserved = false
  let harnessLimitFailure: string | null = null
  const compensations: HarnessCompensationEntry[] = []
  const manualRecovery: HarnessManualRecoveryEntry[] = []

  const remainingMs = (): number | null => deadlineAtMs === null
    ? null
    : Math.max(0, deadlineAtMs - now().getTime())

  const abortForDeadline = () => {
    if (!controller.signal.aborted) controller.abort()
  }

  const withinDeadline = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (controller.signal.aborted) throw deadlineError()
    const remaining = remainingMs()
    if (remaining !== null && remaining <= 0) {
      abortForDeadline()
      throw deadlineError()
    }
    if (remaining === null) return operation()

    let timer: ReturnType<typeof setTimeout> | undefined
    let abortListener: (() => void) | undefined
    try {
      const timeout = new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => {
          abortForDeadline()
          reject(deadlineError())
        }, remaining)
      })
      const aborted = new Promise<T>((_resolve, reject) => {
        abortListener = () => reject(deadlineError())
        controller.signal.addEventListener('abort', abortListener, { once: true })
      })
      return await Promise.race([operation(), timeout, aborted])
    } finally {
      if (timer) clearTimeout(timer)
      if (abortListener) controller.signal.removeEventListener('abort', abortListener)
    }
  }

  const usage = () => {
    const finishedAtMs = now().getTime()
    return Object.freeze({
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      elapsedMs: Math.max(0, finishedAtMs - startedAt),
      toolCalls,
      maxConcurrentObserved,
      reservedCostUsd: Number(reservedCostUsd.toFixed(8)),
      ...(runtimeManifest.deadlineAt ? { deadlineAt: runtimeManifest.deadlineAt } : {}),
      limits: Object.freeze({ ...runtimeManifest.limits }),
    })
  }

  const finish = async (result: HarnessRunResult): Promise<HarnessRunResult> => {
    parentExecution?.signal.removeEventListener('abort', parentAbort)
    if (result.outcome.status === 'success') {
      return {
        ...result,
        trajectory: journal.snapshot(),
        usage: usage(),
      }
    }
    const compensation = await runHarnessCompensations(journal, compensations, manualRecovery)
    const compensationFailed = compensation.status === 'failed'
      || compensation.status === 'partial'
      || compensation.status === 'manual_recovery_required'
    const outcome = compensationFailed
      ? {
          status: 'harness_failure' as const,
          verifierRef: result.outcome.verifierRef,
          failureCode: compensation.status === 'manual_recovery_required'
            ? 'harness_manual_recovery_required'
            : 'harness_compensation_failed',
        }
      : result.outcome
    return {
      ...result,
      trajectory: journal.snapshot(),
      outcome,
      usage: usage(),
      compensation,
    }
  }

  const registerPotentialMutationRecovery = (
    action: HarnessAction,
    reason: string,
  ) => {
    const grant = runtimeManifest.capabilities.find(item => item.id === action.capabilityId)
    if (!grant?.mutating) return
    if (action.compensation?.mode === 'compensate') {
      if (!compensations.some(item => item.actionId === action.actionId)) {
        compensations.push({
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          compensation: action.compensation,
        })
      }
      return
    }
    if (action.compensation?.mode === 'irreversible') {
      if (!manualRecovery.some(item => item.actionId === action.actionId)) {
        manualRecovery.push({
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          reason,
        })
      }
    }
  }

  journal.append({
    kind: 'run_started',
    summary: `Harness worker run started in ${runtimeManifest.profile} profile.`,
    evidenceRefs: [runtimeManifest.authorityManifestRef],
    data: {
      ...(runtimeManifest.deadlineAt ? { deadlineAt: runtimeManifest.deadlineAt } : {}),
      limits: { ...runtimeManifest.limits },
    },
  })

  let resolution
  try {
    resolution = await withinDeadline(() => input.capabilities.resolve(runtimeManifest))
  } catch (error) {
    const code = isDeadlineError(error)
      ? 'harness_deadline_exceeded'
      : 'harness_capability_resolution_failed'
    journal.append({
      kind: 'failure',
      summary: isDeadlineError(error)
        ? 'Harness absolute deadline expired during capability resolution.'
        : 'Harness capability resolution failed.',
      data: { code },
    })
    return finish({
      runId: runtimeManifest.runId,
      profile: runtimeManifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: code },
      authorityExpanded: false,
      productionMutationObserved: false,
    })
  }

  if (!resolution.satisfied) {
    journal.append({
      kind: 'failure',
      summary: 'Required Harness capability is unavailable for this exact run.',
      data: {
        code: resolution.reason ?? 'harness_capability_unavailable',
        missing: [...resolution.missing],
      },
    })
    return finish({
      runId: runtimeManifest.runId,
      profile: runtimeManifest.profile,
      trajectory: journal.snapshot(),
      outcome: {
        status: 'harness_failure',
        failureCode: resolution.reason ?? 'harness_capability_unavailable',
      },
      authorityExpanded: false,
      productionMutationObserved: false,
    })
  }

  journal.append({
    kind: 'capability_resolved',
    summary: 'Harness capability resolver bound all capabilities for the exact assignment.',
    data: { capabilityIds: Object.keys(resolution.resolved).sort() },
  })

  const execute = async (action: HarnessAction): Promise<HarnessActionResult> => {
    if (authorityBoundaryReached) {
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'authority_boundary',
        error: 'harness_run_already_halted_on_authority_boundary',
      })
    }

    if (controller.signal.aborted || (remainingMs() !== null && remainingMs()! <= 0)) {
      abortForDeadline()
      harnessLimitFailure = 'harness_deadline_exceeded'
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: harnessLimitFailure,
      })
    }

    const maxToolCalls = runtimeManifest.limits.maxToolCalls
    if (maxToolCalls !== undefined && toolCalls >= maxToolCalls) {
      harnessLimitFailure = 'harness_tool_call_limit_exceeded'
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: harnessLimitFailure,
      })
    }

    if (!resolution.resolved[action.capabilityId]) {
      authorityBoundaryReached = true
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'authority_boundary',
        error: 'harness_capability_not_resolved_for_run',
      })
    }

    const contractViolation = harnessCompensationContractViolation(runtimeManifest, action)
    if (contractViolation) {
      harnessLimitFailure = contractViolation
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: contractViolation,
      })
    }

    const maxConcurrency = runtimeManifest.limits.maxConcurrency
    if (maxConcurrency !== undefined && activeExecutions >= maxConcurrency) {
      harnessLimitFailure = 'harness_concurrency_limit_exceeded'
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: harnessLimitFailure,
      })
    }

    activeExecutions += 1
    maxConcurrentObserved = Math.max(maxConcurrentObserved, activeExecutions)
    let actionReservedCostUsd = 0
    try {
      const maxCostUsd = runtimeManifest.limits.maxCostUsd
      if (maxCostUsd !== undefined) {
        if (!input.costBudget) {
          harnessLimitFailure = 'harness_cost_budget_required'
          return Object.freeze({
            actionId: action.actionId,
            capabilityId: action.capabilityId,
            status: 'execution_failed',
            error: harnessLimitFailure,
          })
        }

        const remainingCostUsd = Math.max(0, maxCostUsd - reservedCostUsd)
        let reservation
        try {
          reservation = await withinDeadline(() => input.costBudget!.reserve({
            manifest: runtimeManifest,
            action,
            remainingCostUsd,
          }))
        } catch (error) {
          harnessLimitFailure = isDeadlineError(error)
            ? 'harness_deadline_exceeded'
            : 'harness_cost_budget_reservation_failed'
          return Object.freeze({
            actionId: action.actionId,
            capabilityId: action.capabilityId,
            status: 'execution_failed',
            error: harnessLimitFailure,
          })
        }

        const requestedReservation = Number(reservation.reservedCostUsd)
        if (
          !reservation.allowed ||
          !Number.isFinite(requestedReservation) ||
          requestedReservation < 0
        ) {
          harnessLimitFailure = reservation.allowed
            ? 'harness_cost_budget_invalid'
            : 'harness_cost_budget_denied'
          return Object.freeze({
            actionId: action.actionId,
            capabilityId: action.capabilityId,
            status: 'execution_failed',
            error: harnessLimitFailure,
          })
        }
        if (requestedReservation > remainingCostUsd + Number.EPSILON) {
          harnessLimitFailure = 'harness_cost_budget_exceeded'
          return Object.freeze({
            actionId: action.actionId,
            capabilityId: action.capabilityId,
            status: 'execution_failed',
            error: harnessLimitFailure,
          })
        }

        actionReservedCostUsd = requestedReservation
        reservedCostUsd += requestedReservation
      }

      toolCalls += 1
      journal.append({
        kind: 'tool_call',
        summary: `Governed capability requested: ${action.capabilityId}`,
        ...(action.preconditionEvidenceRefs?.length
          ? { evidenceRefs: [...new Set(action.preconditionEvidenceRefs.filter(Boolean))] }
          : {}),
        data: {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          compensationMode: action.compensation?.mode ?? null,
          ...(runtimeManifest.limits.maxCostUsd !== undefined
            ? {
                reservedCostUsd: actionReservedCostUsd,
                cumulativeReservedCostUsd: reservedCostUsd,
              }
            : {}),
        },
      })

      let result: HarnessActionResult
      try {
        result = await withinDeadline(() => input.executor.execute(
          runtimeManifest,
          action,
          Object.freeze({
            signal: controller.signal,
            ...(runtimeManifest.deadlineAt ? { deadlineAt: runtimeManifest.deadlineAt } : {}),
          }),
        ))
      } catch (error) {
        const code = isDeadlineError(error)
          ? 'harness_deadline_exceeded'
          : diagnosticFailureCode(
              {
                verified: false,
                verifierRef: 'harness://executor',
                evidenceRefs: [],
                reason: error instanceof Error ? error.message : 'harness_executor_failed',
              },
              'harness_executor_failed',
            )
        if (isDeadlineError(error)) harnessLimitFailure = code
        registerPotentialMutationRecovery(action, code)
        result = Object.freeze({
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          status: 'execution_failed' as const,
          error: code,
        })
      }

      const grant = runtimeManifest.capabilities.find(item => item.id === action.capabilityId)
      const executionReported = result.status === 'executed'
      if (
        executionReported
        && (grant?.risk ?? (grant?.mutating ? 'write' : 'read')) === 'consequential'
        && !(result.evidenceRefs ?? []).some(value => String(value ?? '').trim())
      ) {
        harnessLimitFailure = 'harness_consequential_action_evidence_required'
        registerPotentialMutationRecovery(action, harnessLimitFailure)
        result = Object.freeze({
          ...result,
          status: 'execution_failed' as const,
          error: harnessLimitFailure,
        })
      } else if (executionReported && action.compensation?.mode === 'compensate') {
        registerPotentialMutationRecovery(action, 'verification_or_later_run_failure')
      } else if (executionReported && action.compensation?.mode === 'irreversible') {
        registerPotentialMutationRecovery(action, action.compensation.reason)
      } else if (result.status === 'execution_failed') {
        // A remote mutation can fail after partially applying. Idempotent compensation is safer
        // than assuming "failed" means "no effect"; irreversible uncertainty requires manual review.
        registerPotentialMutationRecovery(action, result.error ?? 'governed_mutation_outcome_uncertain')
      }

      actionResults.push(result)
      if (result.status === 'authority_boundary') authorityBoundaryReached = true

      if (
        executionReported
        && runtimeManifest.environment.class === 'production'
        && grant?.mutating
      ) {
        productionMutationObserved = true
      }

      journal.append({
        kind: 'tool_result',
        summary: `Governed capability result: ${result.status}`,
        ...(result.evidenceRefs?.length ? { evidenceRefs: [...result.evidenceRefs] } : {}),
        data: {
          actionId: result.actionId,
          capabilityId: result.capabilityId,
          status: result.status,
          verdict: result.gatewayOutcome?.verdict ?? null,
        },
      })
      return result
    } finally {
      activeExecutions = Math.max(0, activeExecutions - 1)
    }
  }

  try {
    await withinDeadline(() => withHarnessExecutionContext(
      runtimeManifest,
      controller.signal,
      () => input.worker.run({
        manifest: runtimeManifest,
        capabilities: resolution.resolved,
        signal: controller.signal,
        deadlineAt: runtimeManifest.deadlineAt,
        remainingMs,
        execute,
        observe(observation) {
          return journal.append({
            kind: 'observation',
            summary: observation.summary,
            evidenceRefs: observation.evidenceRefs,
            data: observation.data,
          })
        },
      }),
    ))
  } catch (error) {
    const code = isDeadlineError(error)
      ? 'harness_deadline_exceeded'
      : diagnosticFailureCode(
          {
            verified: false,
            verifierRef: 'harness://worker',
            evidenceRefs: [],
            reason: error instanceof Error ? error.message : 'harness_worker_failed',
          },
          'harness_worker_failed',
        )
    if (isDeadlineError(error)) harnessLimitFailure = code
    journal.append({
      kind: 'failure',
      summary: isDeadlineError(error)
        ? 'Harness absolute deadline expired while the worker was active.'
        : 'Harness worker terminated unexpectedly.',
      data: { code },
    })
    return finish({
      runId: runtimeManifest.runId,
      profile: runtimeManifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: code },
      authorityExpanded: false,
      productionMutationObserved,
    })
  }

  if (
    !harnessLimitFailure
    && (controller.signal.aborted || (remainingMs() !== null && remainingMs()! <= 0))
  ) {
    abortForDeadline()
    harnessLimitFailure = 'harness_deadline_exceeded'
  }

  if (authorityBoundaryReached) {
    journal.append({
      kind: 'escalation',
      summary: 'Run halted at an authority boundary; alternate routing is forbidden.',
    })
    return finish({
      runId: runtimeManifest.runId,
      profile: runtimeManifest.profile,
      trajectory: journal.snapshot(),
      outcome: {
        status: 'authority_halt',
        failureCode: 'harness_authority_boundary_reached',
      },
      authorityExpanded: false,
      productionMutationObserved,
    })
  }

  if (harnessLimitFailure) {
    journal.append({
      kind: 'failure',
      summary: 'Harness execution limit or action contract reached.',
      data: { code: harnessLimitFailure },
    })
    return finish({
      runId: runtimeManifest.runId,
      profile: runtimeManifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: harnessLimitFailure },
      authorityExpanded: false,
      productionMutationObserved,
    })
  }

  let verification: HarnessVerificationResult
  try {
    verification = normalizeHarnessVerification(await withinDeadline(() => input.verifier.verify({
      manifest: runtimeManifest,
      trajectory: journal.snapshot(),
      actionResults: Object.freeze([...actionResults]),
    })))
  } catch (error) {
    verification = Object.freeze({
      verified: false,
      verifierRef: 'verifier://unavailable',
      evidenceRefs: Object.freeze([]),
      reason: isDeadlineError(error) ? 'harness_deadline_exceeded' : 'harness_verifier_failed',
      failureAttribution: 'harness',
    })
    if (isDeadlineError(error)) harnessLimitFailure = 'harness_deadline_exceeded'
  }

  if (harnessLimitFailure) {
    journal.append({
      kind: 'failure',
      summary: 'Harness absolute deadline expired before independent verification completed.',
      data: { code: harnessLimitFailure },
    })
    return finish({
      runId: runtimeManifest.runId,
      profile: runtimeManifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: harnessLimitFailure },
      authorityExpanded: false,
      productionMutationObserved,
    })
  }

  journal.append({
    kind: 'verification',
    summary: verification.verified
      ? 'Independent outcome verification passed.'
      : 'Independent outcome verification did not confirm success.',
    evidenceRefs: verification.evidenceRefs,
    data: {
      verifierRef: verification.verifierRef,
      verified: verification.verified,
      failureAttribution: verification.failureAttribution ?? null,
    },
  })

  const classification = verification.verified
    ? classifyHarnessResult({ verification })
    : verification.failureAttribution === 'infrastructure'
      ? classifyHarnessResult({ infrastructureFailure: true, verification })
      : verification.failureAttribution === 'competency'
        ? classifyHarnessResult({ agentCompetencyFailure: true, verification })
        : verification.failureAttribution === 'authority'
          ? classifyHarnessResult({ authorityBoundaryReached: true, verification })
          : classifyHarnessResult({ executionCompleted: true, verification })

  if (classification.status !== 'success') {
    journal.append({
      kind: 'failure',
      summary: `Harness outcome routed to ${classification.destination}.`,
      data: {
        status: classification.status,
        destination: classification.destination,
        reason: classification.reason,
      },
    })
  }

  journal.append({
    kind: 'run_finished',
    summary: classification.status === 'success'
      ? 'Harness worker run completed with verified evidence.'
      : 'Harness worker run completed without verified success.',
  })

  return finish({
    runId: runtimeManifest.runId,
    profile: runtimeManifest.profile,
    trajectory: journal.snapshot(),
    outcome: {
      status: classification.status,
      verifierRef: verification.verifierRef,
      ...(classification.status === 'success'
        ? {}
        : { failureCode: diagnosticFailureCode(verification, classification.reason) }),
    },
    authorityExpanded: false,
    productionMutationObserved,
  })
}
