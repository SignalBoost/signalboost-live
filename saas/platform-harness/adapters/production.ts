// saas/platform-harness/adapters/production.ts
import type {
  HarnessAuthorityEnvelope,
  HarnessEnvironmentClass,
  HarnessLimits,
  HarnessManifest,
  HarnessRunRequest,
} from '../core/types.ts'
import { resolveChildHarnessManifest, resolveHarnessManifest } from '../core/policy.ts'
import type { HarnessCapabilityResolverPort } from '../capabilities/resolver.ts'
import type { GovernedHarnessExecutor } from '../runtime/governed-executor.ts'
import { runHarnessWorker, type HarnessWorkerPort } from '../runtime/runner.ts'
import type { HarnessTrajectoryVerifier } from '../verification/outcome-verifier.ts'
import type { HarnessCostBudgetPort } from '../runtime/cost-budget.ts'
import {
  completeHarnessRun,
  type CompletedHarnessRun,
} from '../runtime/completion.ts'
import type { HarnessEvidenceSink } from '../evidence/durable-evidence.ts'

export function createProductionHarnessRequest(input: {
  runId: string
  objective: string
  tenantId: string
  portableId: string
  agentId: string
  role: string
  environmentId: string
  environmentClass?: Extract<HarnessEnvironmentClass, 'staging' | 'production'>
  requestedCapabilities?: readonly string[]
  limits?: HarnessLimits
  deadlineAt?: string
  artifact?: {
    artifactId: string
    artifactHash?: string
    revision?: string
  }
  parent?: {
    runId: string
    authorityManifestRef: string
  }
}): HarnessRunRequest {
  const explicitDeadline = String(input.deadlineAt ?? '').trim()
  const relativeDeadlineMs = Number(input.limits?.deadlineMs)
  const derivedDeadline = Number.isFinite(relativeDeadlineMs) && relativeDeadlineMs >= 0
    ? new Date(Date.now() + relativeDeadlineMs).toISOString()
    : ''
  const deadlineAt = explicitDeadline || derivedDeadline

  return Object.freeze({
    runId: input.runId,
    objective: input.objective,
    identity: Object.freeze({
      agentId: input.agentId,
      role: input.role,
      tenantId: input.tenantId,
      portableId: input.portableId,
      ...(input.artifact
        ? { artifact: Object.freeze({ ...input.artifact }) }
        : {}),
    }),
    profile: 'production',
    environment: Object.freeze({
      environmentId: input.environmentId,
      class: input.environmentClass ?? 'production',
    }),
    requestedCapabilities: Object.freeze([...(input.requestedCapabilities ?? [])]),
    ...(deadlineAt ? { deadlineAt } : {}),
    ...(input.parent
      ? { parent: Object.freeze({ ...input.parent }) }
      : {}),
    ...(input.limits
      ? { requestedLimits: Object.freeze({ ...input.limits }) }
      : {}),
  })
}

export type ProductionHarnessEnvelopeResult =
  | {
      accepted: false
      reasons: readonly string[]
    }
  | {
      accepted: true
      completed: CompletedHarnessRun
    }

/**
 * Canonical Production envelope for COS/specialist workers.
 *
 * Callers provide already-verified authority plus host capability/execution ports.
 * The helper resolves the Production manifest, runs the shared Harness worker,
 * persists durable evidence, and only then returns the classified completion route.
 */
export async function runProductionHarnessEnvelope(input: {
  request: HarnessRunRequest
  authority: HarnessAuthorityEnvelope
  capabilities: HarnessCapabilityResolverPort
  executor: GovernedHarnessExecutor
  worker: HarnessWorkerPort
  verifier: HarnessTrajectoryVerifier
  evidenceSink: HarnessEvidenceSink
  costBudget?: HarnessCostBudgetPort
  parentManifest?: HarnessManifest
}): Promise<ProductionHarnessEnvelopeResult> {
  if (
    input.request.profile !== 'production' ||
    !['staging', 'production'].includes(input.request.environment.class)
  ) {
    return Object.freeze({
      accepted: false,
      reasons: Object.freeze(['production_harness_profile_required']),
    })
  }

  const decision = input.parentManifest
    ? resolveChildHarnessManifest(input.request, input.authority, input.parentManifest)
    : resolveHarnessManifest(input.request, input.authority)
  if (decision.allowed === false) {
    return Object.freeze({
      accepted: false,
      reasons: Object.freeze([...decision.reasons]),
    })
  }

  const result = await runHarnessWorker({
    manifest: decision.manifest,
    capabilities: input.capabilities,
    executor: input.executor,
    worker: input.worker,
    verifier: input.verifier,
    ...(input.costBudget ? { costBudget: input.costBudget } : {}),
  })

  const completed = await completeHarnessRun({
    manifest: decision.manifest,
    result,
    evidenceSink: input.evidenceSink,
  })

  return Object.freeze({ accepted: true, completed })
}
