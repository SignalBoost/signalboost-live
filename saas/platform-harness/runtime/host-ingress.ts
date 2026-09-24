// saas/platform-harness/runtime/host-ingress.ts
//
// Host-owned ingress for internal background/worker seams that predate the Platform Harness.
// This does NOT replace Governed Socket execution, independent verification, compensation, or
// durable evidence. It guarantees that shared workers cannot begin outside a bounded HarnessRun,
// so downstream provider/tool adapters inherit the run identity, deadline and cancellation signal.

import { randomUUID } from 'node:crypto'
import {
  createProductionHarnessRequest,
  resolveHarnessManifest,
} from '../index.ts'
import {
  currentHarnessExecutionContext,
  withHarnessExecutionContext,
} from './execution-context.ts'
import type { HarnessCapabilityRisk } from '../core/types.ts'

export type HostProductionHarnessIngressInput = Readonly<{
  objective: string
  portableId: string
  agentId: string
  role: string
  capabilityId: string
  risk?: HarnessCapabilityRisk
  tenantId?: string
  environmentId?: string
  deadlineMs?: number
  maxToolCalls?: number
  maxConcurrency?: number
  maxCostUsd?: number
  runId?: string
}>

function boundedPositive(value: number | undefined, fallback: number): number {
  const candidate = Number(value)
  return Number.isFinite(candidate) && candidate > 0 ? Math.floor(candidate) : fallback
}

/**
 * Bind one host-owned Production worker to a verified, least-authority HarnessRun.
 *
 * If a caller is already inside a HarnessRun, the existing run always wins. This helper never
 * creates a sibling or widened nested authority envelope.
 */
export async function withHostProductionHarnessIngress<T>(
  input: HostProductionHarnessIngressInput,
  operation: () => Promise<T>,
): Promise<T> {
  if (currentHarnessExecutionContext()) return operation()

  const risk = input.risk ?? 'write'
  const deadlineMs = boundedPositive(input.deadlineMs, 300_000)
  const maxConcurrency = boundedPositive(input.maxConcurrency, 1)
  const maxToolCalls = boundedPositive(input.maxToolCalls, 1)
  const runId = String(input.runId || '').trim() || `host-ingress-${randomUUID()}`
  const capabilityId = String(input.capabilityId || '').trim()
  if (!capabilityId) throw new Error('host_harness_ingress_capability_required')

  const request = createProductionHarnessRequest({
    runId,
    objective: input.objective,
    tenantId: input.tenantId || 'itmounts',
    portableId: input.portableId,
    agentId: input.agentId,
    role: input.role,
    environmentId: input.environmentId || 'itmounts-production',
    requestedCapabilities: [capabilityId],
    limits: {
      deadlineMs,
      maxToolCalls,
      maxConcurrency,
      ...(Number.isFinite(Number(input.maxCostUsd)) && Number(input.maxCostUsd) >= 0
        ? { maxCostUsd: Number(input.maxCostUsd) }
        : {}),
    },
  })

  const decision = resolveHarnessManifest(request, {
    manifestRef: `host://universal-ingress/${runId}`,
    verified: true,
    verifiedBy: 'host',
    environments: ['production'],
    capabilities: [{
      id: capabilityId,
      environments: ['production'],
      mutating: risk !== 'read',
      risk,
      scopes: [capabilityId],
    }],
    limits: {
      deadlineMs,
      maxToolCalls,
      maxConcurrency,
      ...(Number.isFinite(Number(input.maxCostUsd)) && Number(input.maxCostUsd) >= 0
        ? { maxCostUsd: Number(input.maxCostUsd) }
        : {}),
    },
  })

  if (decision.allowed === false) {
    throw new Error(`host_harness_ingress_denied:${decision.reasons.join(',')}`)
  }

  const controller = new AbortController()
  const deadlineAt = decision.manifest.deadlineAt ? Date.parse(decision.manifest.deadlineAt) : NaN
  const remaining = Number.isFinite(deadlineAt) ? Math.max(0, deadlineAt - Date.now()) : deadlineMs
  if (remaining <= 0) controller.abort('harness_deadline_exceeded')
  const timer = remaining > 0
    ? setTimeout(() => controller.abort('harness_deadline_exceeded'), remaining)
    : undefined

  try {
    return await withHarnessExecutionContext(decision.manifest, controller.signal, operation)
  } finally {
    if (timer) clearTimeout(timer)
  }
}
