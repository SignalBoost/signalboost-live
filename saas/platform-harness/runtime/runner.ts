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
  if (!grant?.mutating) return null
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
  if (compensation.mode === 'irreversible' && grant.risk !== 'consequential') {
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
): Promise<HarnessCompensationSummary> {
  if (!stack.length) {
    return Object.freeze({ status: 'not_required', attempted: 0, completed: 0, failedActionIds: Object.freeze([]) })
  }
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
  const status = completed === stack.length ? 'completed' : completed === 0 ? 'failed' : 'partial'
  return Object.freeze({
    status,
    attempted: stack.length,
    completed,
    failedActionIds: Object.freeze(failedActionIds),
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

/**
 * Shared live-worker runner for COS/Specialists/Builder.
 *
 * Capability resolution is mandatory before the worker receives capabilities. The resolver may be Provider Hub, native host capabilities, or a bounded composition of both.
 * The worker cannot widen its manifest, and failure attribution belongs to the
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
  const journal = createTrajectoryJournal(input.manifest.runId, now)
  const actionResults: HarnessActionResult[] = []
  const startedAt = now().getTime()
  let toolCalls = 0
  let activeExecutions = 0
  let reservedCostUsd = 0
  let authorityBoundaryReached = false
  let productionMutationObserved = false
  let harnessLimitFailure: string | null = null
  const compensations: HarnessCompensationEntry[] = []
  const finish = async (result: HarnessRunResult): Promise<HarnessRunResult> => {
    if (result.outcome.status === 'success') return result
    const compensation = await runHarnessCompensations(journal, compensations)
    return { ...result, trajectory: journal.snapshot(), compensation }
  }

  journal.append({
    kind: 'run_started',
    summary: `Harness worker run started in ${input.manifest.profile} profile.`,
    evidenceRefs: [input.manifest.authorityManifestRef],
  })

  let resolution
  try {
    resolution = await input.capabilities.resolve(input.manifest)
  } catch {
    journal.append({
      kind: 'failure',
      summary: 'Harness capability resolution failed.',
      data: { code: 'harness_capability_resolution_failed' },
    })
    return {
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: journal.snapshot(),
      outcome: {
        status: 'harness_failure',
        failureCode: 'harness_capability_resolution_failed',
      },
      authorityExpanded: false,
      productionMutationObserved: false,
    }
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
    return {
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: journal.snapshot(),
      outcome: {
        status: 'harness_failure',
        failureCode: resolution.reason ?? 'harness_capability_unavailable',
      },
      authorityExpanded: false,
      productionMutationObserved: false,
    }
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

    const deadlineMs = input.manifest.limits.deadlineMs
    if (deadlineMs !== undefined && now().getTime() - startedAt >= deadlineMs) {
      harnessLimitFailure = 'harness_deadline_exceeded'
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: harnessLimitFailure,
      })
    }

    const maxToolCalls = input.manifest.limits.maxToolCalls
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

    const contractViolation = harnessCompensationContractViolation(input.manifest, action)
    if (contractViolation) {
      harnessLimitFailure = contractViolation
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: contractViolation,
      })
    }

    const maxConcurrency = input.manifest.limits.maxConcurrency
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
    let actionReservedCostUsd = 0
    try {
      const maxCostUsd = input.manifest.limits.maxCostUsd
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
          reservation = await input.costBudget.reserve({
            manifest: input.manifest,
            action,
            remainingCostUsd,
          })
        } catch {
          harnessLimitFailure = 'harness_cost_budget_reservation_failed'
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
        data: {
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          ...(input.manifest.limits.maxCostUsd !== undefined
            ? {
                reservedCostUsd: actionReservedCostUsd,
                cumulativeReservedCostUsd: reservedCostUsd,
              }
            : {}),
        },
      })

      const result = await input.executor.execute(input.manifest, action)
      actionResults.push(result)
      if (result.status === 'executed' && action.compensation?.mode === 'compensate') {
        compensations.push({
          actionId: action.actionId,
          capabilityId: action.capabilityId,
          compensation: action.compensation,
        })
      }
      if (result.status === 'authority_boundary') authorityBoundaryReached = true

      const grant = input.manifest.capabilities.find(item => item.id === action.capabilityId)
      if (
        result.status === 'executed' &&
        input.manifest.environment.class === 'production' &&
        grant?.mutating
      ) {
        productionMutationObserved = true
      }

      journal.append({
        kind: 'tool_result',
        summary: `Governed capability result: ${result.status}`,
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
    await input.worker.run({
      manifest: input.manifest,
      capabilities: resolution.resolved,
      execute,
      observe(observation) {
        return journal.append({
          kind: 'observation',
          summary: observation.summary,
          evidenceRefs: observation.evidenceRefs,
          data: observation.data,
        })
      },
    })
  } catch (error) {
    const code=diagnosticFailureCode(
      { verified:false, verifierRef:'harness://worker', evidenceRefs:[], reason:error instanceof Error?error.message:'harness_worker_failed' },
      'harness_worker_failed',
    )
    journal.append({
      kind: 'failure',
      summary: 'Harness worker terminated unexpectedly.',
      data: { code },
    })
    return finish({
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: code },
      authorityExpanded: false,
      productionMutationObserved,
    })
  }

  const finalDeadlineMs = input.manifest.limits.deadlineMs
  if (
    !harnessLimitFailure &&
    finalDeadlineMs !== undefined &&
    now().getTime() - startedAt >= finalDeadlineMs
  ) {
    harnessLimitFailure = 'harness_deadline_exceeded'
  }

  if (authorityBoundaryReached) {
    journal.append({
      kind: 'escalation',
      summary: 'Run halted at an authority boundary; alternate routing is forbidden.',
    })
    return finish({
      runId: input.manifest.runId,
      profile: input.manifest.profile,
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
      summary: 'Harness execution limit reached.',
      data: { code: harnessLimitFailure },
    })
    return finish({
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: harnessLimitFailure },
      authorityExpanded: false,
      productionMutationObserved,
    })
  }

  let verification: HarnessVerificationResult
  try {
    verification = normalizeHarnessVerification(await input.verifier.verify({
      manifest: input.manifest,
      trajectory: journal.snapshot(),
      actionResults: Object.freeze([...actionResults]),
    }))
  } catch {
    verification = Object.freeze({
      verified: false,
      verifierRef: 'verifier://unavailable',
      evidenceRefs: Object.freeze([]),
      reason: 'harness_verifier_failed',
      failureAttribution: 'harness',
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
    runId: input.manifest.runId,
    profile: input.manifest.profile,
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
