// saas/platform-harness/runtime/run-controller.ts
//
// Shared HarnessRun controller. COS/Specialists remain the workers; this controller
// binds policy + capability supply + governed execution + observable evidence +
// independent verification into one fail-closed run.

import type {
  HarnessAuthorityEnvelope,
  HarnessManifest,
  HarnessObservableEvent,
  HarnessRunRequest,
  HarnessRunResult,
  HarnessVerificationResult,
} from '../core/types.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import { classifyHarnessResult } from '../core/failure-router.ts'
import type {
  HarnessCapabilityResolution,
  HarnessCapabilityResolverPort,
} from '../capabilities/provider-hub-resolver.ts'
import {
  createTrajectoryJournal,
  type HarnessTrajectoryJournal,
} from '../evidence/trajectory-journal.ts'
import type {
  GovernedHarnessExecutor,
  HarnessAction,
  HarnessActionResult,
} from './governed-executor.ts'
import {
  normalizeHarnessVerification,
  type HarnessOutcomeVerifierPort,
} from '../verification/outcome-verifier.ts'

export interface HarnessWorkerContext {
  manifest: HarnessManifest
  capabilities: HarnessCapabilityResolution['resolved']
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

export interface RunHarnessOptions {
  request: HarnessRunRequest
  authority: HarnessAuthorityEnvelope
  capabilities: HarnessCapabilityResolverPort
  executor: GovernedHarnessExecutor
  worker: HarnessWorkerPort
  verifier: HarnessOutcomeVerifierPort
  now?: () => Date
}

function terminalResult(input: {
  request: HarnessRunRequest
  journal: HarnessTrajectoryJournal
  status: HarnessRunResult['outcome']['status']
  failureCode: string
  verifierRef?: string
}): HarnessRunResult {
  return Object.freeze({
    runId: input.request.runId,
    profile: input.request.profile,
    trajectory: input.journal.snapshot(),
    outcome: Object.freeze({
      status: input.status,
      failureCode: input.failureCode,
      ...(input.verifierRef ? { verifierRef: input.verifierRef } : {}),
    }),
    authorityExpanded: false,
    productionMutationObserved: false,
  })
}

function classifyVerification(verification: HarnessVerificationResult) {
  if (verification.verified) {
    return classifyHarnessResult({ verification })
  }
  switch (verification.failureAttribution) {
    case 'infrastructure':
      return classifyHarnessResult({ infrastructureFailure: true, verification })
    case 'competency':
      return classifyHarnessResult({ agentCompetencyFailure: true, verification })
    case 'authority':
      return classifyHarnessResult({ authorityBoundaryReached: true, verification })
    default:
      return classifyHarnessResult({ executionCompleted: true, verification })
  }
}

export async function runHarness(
  options: RunHarnessOptions,
): Promise<HarnessRunResult> {
  const now = options.now ?? (() => new Date())
  const journal = createTrajectoryJournal(options.request.runId, now)
  const actionResults: HarnessActionResult[] = []

  journal.append({
    kind: 'run_started',
    summary: `HarnessRun started in ${options.request.profile} profile.`,
  })

  const policy = resolveHarnessManifest(options.request, options.authority)
  if (!policy.allowed) {
    journal.append({
      kind: 'failure',
      summary: 'Harness manifest resolution failed closed.',
      data: { reasons: [...policy.reasons] },
    })
    journal.append({ kind: 'run_finished', summary: 'HarnessRun halted before capability resolution.' })
    return terminalResult({
      request: options.request,
      journal,
      status: policy.reasons.some(reason => reason.startsWith('authority_') || reason.startsWith('capability_not_authorized'))
        ? 'authority_halt'
        : 'harness_failure',
      failureCode: policy.reasons[0] ?? 'harness_manifest_rejected',
    })
  }

  const manifest = policy.manifest
  journal.append({
    kind: 'manifest_bound',
    summary: 'Exact Harness manifest bound to trusted authority and profile constraints.',
    data: {
      authorityManifestRef: manifest.authorityManifestRef,
      environmentId: manifest.environment.environmentId,
      capabilityCount: manifest.capabilities.length,
    },
  })

  let capabilityResolution: HarnessCapabilityResolution
  try {
    capabilityResolution = await options.capabilities.resolve(manifest)
  } catch {
    journal.append({
      kind: 'failure',
      summary: 'Provider Hub capability discovery failed.',
      data: { code: 'harness_provider_hub_discovery_failed' },
    })
    journal.append({ kind: 'run_finished', summary: 'HarnessRun stopped before worker execution.' })
    return terminalResult({
      request: options.request,
      journal,
      status: 'harness_failure',
      failureCode: 'harness_provider_hub_discovery_failed',
    })
  }

  if (!capabilityResolution.satisfied) {
    journal.append({
      kind: 'failure',
      summary: 'Required capability assignment is unavailable.',
      data: {
        code: capabilityResolution.reason ?? 'harness_capability_unavailable',
        missing: [...capabilityResolution.missing],
      },
    })
    journal.append({ kind: 'run_finished', summary: 'HarnessRun stopped because capability supply is incomplete.' })
    return terminalResult({
      request: options.request,
      journal,
      status: 'harness_failure',
      failureCode: capabilityResolution.reason ?? 'harness_capability_unavailable',
    })
  }

  journal.append({
    kind: 'capability_resolved',
    summary: 'Provider Hub resolved all requested Harness capabilities.',
    data: { capabilityIds: Object.keys(capabilityResolution.resolved).sort() },
  })

  const startedAt = now().getTime()
  let toolCalls = 0
  let authorityBoundaryReached = false
  let harnessLimitFailure: string | null = null

  const execute = async (action: HarnessAction): Promise<HarnessActionResult> => {
    if (authorityBoundaryReached) {
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'authority_boundary',
        error: 'harness_run_already_halted_on_authority_boundary',
      })
    }

    const deadlineMs = manifest.limits.deadlineMs
    if (deadlineMs !== undefined && now().getTime() - startedAt > deadlineMs) {
      harnessLimitFailure = 'harness_deadline_exceeded'
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: harnessLimitFailure,
      })
    }

    const maxToolCalls = manifest.limits.maxToolCalls
    if (maxToolCalls !== undefined && toolCalls >= maxToolCalls) {
      harnessLimitFailure = 'harness_tool_call_limit_exceeded'
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'execution_failed',
        error: harnessLimitFailure,
      })
    }

    if (!capabilityResolution.resolved[action.capabilityId]) {
      authorityBoundaryReached = true
      return Object.freeze({
        actionId: action.actionId,
        capabilityId: action.capabilityId,
        status: 'authority_boundary',
        error: 'harness_capability_not_resolved_for_run',
      })
    }

    toolCalls += 1
    journal.append({
      kind: 'tool_call',
      summary: `Governed capability requested: ${action.capabilityId}`,
      data: { actionId: action.actionId, capabilityId: action.capabilityId },
    })

    const result = await options.executor.execute(manifest, action)
    actionResults.push(result)
    if (result.status === 'authority_boundary') authorityBoundaryReached = true

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
  }

  try {
    await options.worker.run({
      manifest,
      capabilities: capabilityResolution.resolved,
      execute,
      observe(input) {
        return journal.append({
          kind: 'observation',
          summary: input.summary,
          evidenceRefs: input.evidenceRefs,
          data: input.data,
        })
      },
    })
  } catch {
    journal.append({
      kind: 'failure',
      summary: 'Harness worker terminated unexpectedly.',
      data: { code: 'harness_worker_failed' },
    })
    journal.append({ kind: 'run_finished', summary: 'HarnessRun ended after worker failure.' })
    return terminalResult({
      request: options.request,
      journal,
      status: 'harness_failure',
      failureCode: 'harness_worker_failed',
    })
  }

  if (authorityBoundaryReached) {
    journal.append({
      kind: 'failure',
      summary: 'Run halted at an authority boundary; no alternate route is permitted.',
      data: { code: 'harness_authority_boundary_reached' },
    })
    journal.append({ kind: 'run_finished', summary: 'HarnessRun halted for authority.' })
    return terminalResult({
      request: options.request,
      journal,
      status: 'authority_halt',
      failureCode: 'harness_authority_boundary_reached',
    })
  }

  if (harnessLimitFailure) {
    journal.append({
      kind: 'failure',
      summary: 'Harness execution limit was reached.',
      data: { code: harnessLimitFailure },
    })
    journal.append({ kind: 'run_finished', summary: 'HarnessRun stopped at its configured limit.' })
    return terminalResult({
      request: options.request,
      journal,
      status: 'harness_failure',
      failureCode: harnessLimitFailure,
    })
  }

  let verification: HarnessVerificationResult
  try {
    verification = normalizeHarnessVerification(await options.verifier.verify({
      manifest,
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

  const classification = classifyVerification(verification)
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
      ? 'HarnessRun completed with verified evidence.'
      : 'HarnessRun completed without a verified success.',
  })

  return Object.freeze({
    runId: manifest.runId,
    profile: manifest.profile,
    trajectory: journal.snapshot(),
    outcome: Object.freeze({
      status: classification.status,
      verifierRef: verification.verifierRef,
      ...(verification.evidenceRefs[0]
        ? { evidenceHash: verification.evidenceRefs[0] }
        : {}),
      ...(classification.status !== 'success'
        ? { failureCode: classification.reason }
        : {}),
    }),
    authorityExpanded: false,
    productionMutationObserved: false,
  })
}
