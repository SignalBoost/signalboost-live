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
import { currentHarnessExecutionContext, withHarnessExecutionContext } from '../runtime/execution-context.ts'
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

export type ProductionRuntimeHarnessInput = Readonly<{
  runId: string
  objective: string
  tenantId: string
  portableId: string
  agentId: string
  role: string
  environmentId: string
  environmentClass?: Extract<HarnessEnvironmentClass, 'staging' | 'production'>
  limits?: HarnessLimits
}>

/**
 * Mandatory zero-capability Production ingress for platform workloads that are not
 * already inside a parent HarnessRun. It grants no model/tool/provider authority;
 * it binds workload identity and absolute deadline/cancellation to downstream seams.
 */
export async function withProductionRuntimeHarness<T>(
  input: ProductionRuntimeHarnessInput,
  operation: () => Promise<T>,
): Promise<T> {
  const existing = currentHarnessExecutionContext()
  if (existing) return operation()

  const environmentClass = input.environmentClass ?? 'production'
  const request = createProductionHarnessRequest({
    runId: input.runId,
    objective: input.objective,
    tenantId: input.tenantId,
    portableId: input.portableId,
    agentId: input.agentId,
    role: input.role,
    environmentId: input.environmentId,
    environmentClass,
    requestedCapabilities: [],
    limits: { maxToolCalls: 0, maxConcurrency: 1, ...(input.limits ?? {}) },
  })
  const decision = resolveHarnessManifest(request, {
    manifestRef: `host://production-runtime/${String(input.runId || 'run').slice(0, 160)}`,
    verified: true,
    verifiedBy: 'host',
    environments: [environmentClass],
    capabilities: [],
    limits: { maxToolCalls: 0, maxConcurrency: 1, ...(input.limits ?? {}) },
  })
  if (decision.allowed === false) {
    throw new Error(`production_runtime_harness_denied:${decision.reasons.join(',')}`)
  }

  const controller = new AbortController()
  const deadlineAt = decision.manifest.deadlineAt ? Date.parse(decision.manifest.deadlineAt) : NaN
  const relativeDeadlineMs = Number(decision.manifest.limits.deadlineMs)
  const remaining = Number.isFinite(deadlineAt)
    ? Math.max(0, deadlineAt - Date.now())
    : Number.isFinite(relativeDeadlineMs)
      ? Math.max(0, relativeDeadlineMs)
      : null
  let timer: ReturnType<typeof setTimeout> | undefined
  if (remaining !== null) {
    if (remaining <= 0) controller.abort('harness_deadline_exceeded')
    else timer = setTimeout(() => controller.abort('harness_deadline_exceeded'), remaining)
  }

  try {
    return await withHarnessExecutionContext(decision.manifest, controller.signal, operation)
  } finally {
    if (timer) clearTimeout(timer)
  }
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
