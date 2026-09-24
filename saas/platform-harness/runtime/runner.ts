import type {
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
  for (const action of input.plan.actions) {
    const grant = manifest.capabilities.find(item => item.id === action.capabilityId)
    if (!grant) {
      journal.append({
        kind: 'failure',
        summary: 'Action capability is outside resolved manifest',
        data: { actionId: action.actionId, capabilityId: action.capabilityId },
      })
      return {
        runId: manifest.runId,
        profile: manifest.profile,
        trajectory: journal.snapshot(),
        outcome: { status: 'authority_halt', failureCode: 'capability_outside_manifest' },
        authorityExpanded: false,
        productionMutationObserved,
      }
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
      return {
        runId: manifest.runId,
        profile: manifest.profile,
        trajectory: journal.snapshot(),
        outcome: {
          status: 'authority_halt',
          failureCode: 'governed_socket_authority_boundary',
        },
        authorityExpanded: false,
        productionMutationObserved,
      }
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
      return {
        runId: manifest.runId,
        profile: manifest.profile,
        trajectory: journal.snapshot(),
        outcome: {
          status: 'harness_failure',
          failureCode: result.error ?? 'governed_action_failed',
        },
        authorityExpanded: false,
        productionMutationObserved,
      }
    }

    if (manifest.environment.class === 'production' && grant.mutating) {
      productionMutationObserved = true
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

  return {
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
  }
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
    return {
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: code },
      authorityExpanded: false,
      productionMutationObserved,
    }
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
    return {
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: journal.snapshot(),
      outcome: {
        status: 'authority_halt',
        failureCode: 'harness_authority_boundary_reached',
      },
      authorityExpanded: false,
      productionMutationObserved,
    }
  }

  if (harnessLimitFailure) {
    journal.append({
      kind: 'failure',
      summary: 'Harness execution limit reached.',
      data: { code: harnessLimitFailure },
    })
    return {
      runId: input.manifest.runId,
      profile: input.manifest.profile,
      trajectory: journal.snapshot(),
      outcome: { status: 'harness_failure', failureCode: harnessLimitFailure },
      authorityExpanded: false,
      productionMutationObserved,
    }
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

  return {
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
  }
}
