// saas/platform-harness/adapters/cos-ingress.ts
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { HarnessManifest } from '../core/types.ts'
import { resolveHarnessManifest } from '../core/policy.ts'
import { createProductionHarnessRequest } from './production.ts'

export const COS_PRIMARY_HARNESS_AGENT_ID = 'cos-primary'
export const COS_PRIMARY_HARNESS_PORTABLE_ID = 'cos'
export const COS_PRIMARY_HARNESS_ENVIRONMENT_ID = 'itmounts-production'
export const COS_PRIMARY_HARNESS_DEADLINE_MS = 285_000

export type CosHarnessIngressContext = {
  manifest: HarnessManifest
  enteredAt: number
}

const cosHarnessIngressScope = new AsyncLocalStorage<CosHarnessIngressContext>()

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function assertCosProductionManifest(manifest: HarnessManifest): void {
  if (
    manifest.profile !== 'production' ||
    manifest.environment.class !== 'production' ||
    manifest.identity.agentId !== COS_PRIMARY_HARNESS_AGENT_ID
  ) {
    throw new Error('cos_harness_ingress_manifest_invalid')
  }
}

/**
 * Build the mandatory top-level HarnessRun for one interactive COS request.
 *
 * This is intentionally a zero-capability host envelope. It grants no tool/model authority;
 * capability-bearing work remains subject to the normal Harness/Governed Socket intersection.
 * Its job is to make a Production HarnessRun mandatory before COS reasoning can begin.
 */
export function createCosProductionIngressManifest(input: {
  objective: string
  runId?: string
  tenantId?: string
  deadlineMs?: number
}): HarnessManifest {
  const runId = clean(input.runId, 160) || `cos-${randomUUID()}`
  const objective = clean(input.objective, 4_000) || 'Complete one COS request.'
  const tenantId = clean(input.tenantId, 240) || 'itmounts'
  const deadlineMs = Math.min(
    COS_PRIMARY_HARNESS_DEADLINE_MS,
    Math.max(1, Math.floor(input.deadlineMs ?? COS_PRIMARY_HARNESS_DEADLINE_MS)),
  )

  const request = createProductionHarnessRequest({
    runId,
    objective,
    tenantId,
    portableId: COS_PRIMARY_HARNESS_PORTABLE_ID,
    agentId: COS_PRIMARY_HARNESS_AGENT_ID,
    role: 'chief_of_staff',
    environmentId: COS_PRIMARY_HARNESS_ENVIRONMENT_ID,
    environmentClass: 'production',
    requestedCapabilities: [],
    limits: { deadlineMs },
  })

  const decision = resolveHarnessManifest(request, {
    manifestRef: `host://cos-primary-ingress/${runId}`,
    verified: true,
    verifiedBy: 'host',
    environments: ['production'],
    capabilities: [],
    limits: { deadlineMs },
  })

  if (decision.allowed === false) {
    throw new Error(`cos_harness_ingress_denied:${decision.reasons.join(',')}`)
  }

  assertCosProductionManifest(decision.manifest)
  return decision.manifest
}

export function withCosHarnessIngress<T>(
  manifest: HarnessManifest,
  operation: () => Promise<T>,
): Promise<T> {
  assertCosProductionManifest(manifest)
  const existing = cosHarnessIngressScope.getStore()
  if (existing && existing.manifest.runId !== manifest.runId) {
    throw new Error('cos_harness_nested_ingress_forbidden')
  }
  if (existing) return operation()
  return cosHarnessIngressScope.run(
    Object.freeze({ manifest, enteredAt: Date.now() }),
    operation,
  )
}

export function currentCosHarnessIngress(): CosHarnessIngressContext | null {
  return cosHarnessIngressScope.getStore() ?? null
}

/**
 * Fail closed when any code path attempts to enter COS execution without the mandatory HarnessRun.
 */
export function requireCosHarnessIngress(): HarnessManifest {
  const context = cosHarnessIngressScope.getStore()
  if (!context) throw new Error('cos_harness_ingress_required')
  assertCosProductionManifest(context.manifest)
  return context.manifest
}
