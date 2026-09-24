// saas/platform-harness/core/policy.ts
//
// Canonical profile (#2) constraints and manifest resolution.
// A profile only reduces an already-verified authority envelope.

import type {
  HarnessAuthorityEnvelope,
  HarnessEnvironmentClass,
  HarnessLimits,
  HarnessManifest,
  HarnessProfile,
  HarnessRunRequest,
} from './types.ts'

export interface HarnessProfilePolicy {
  profile: HarnessProfile
  allowedEnvironments: readonly HarnessEnvironmentClass[]
  allowMutatingCapabilities: boolean
  learningFeedbackAllowed: boolean
  maxDeadlineMs?: number
  maxToolCalls?: number
}

export const HARNESS_PROFILE_POLICIES: Readonly<Record<HarnessProfile, HarnessProfilePolicy>> =
  Object.freeze({
    residency: Object.freeze({
      profile: 'residency',
      allowedEnvironments: Object.freeze(['synthetic', 'sandbox'] as const),
      allowMutatingCapabilities: true,
      learningFeedbackAllowed: true,
      maxDeadlineMs: 30 * 60_000,
      maxToolCalls: 200,
    }),
    production: Object.freeze({
      profile: 'production',
      allowedEnvironments: Object.freeze(['staging', 'production'] as const),
      allowMutatingCapabilities: true,
      learningFeedbackAllowed: false,
    }),
    sandbox: Object.freeze({
      profile: 'sandbox',
      allowedEnvironments: Object.freeze(['synthetic', 'sandbox'] as const),
      allowMutatingCapabilities: true,
      learningFeedbackAllowed: false,
      maxDeadlineMs: 30 * 60_000,
      maxToolCalls: 200,
    }),
    self_healing: Object.freeze({
      profile: 'self_healing',
      allowedEnvironments: Object.freeze(['sandbox', 'staging', 'production'] as const),
      allowMutatingCapabilities: true,
      learningFeedbackAllowed: false,
    }),
    security_lab: Object.freeze({
      profile: 'security_lab',
      allowedEnvironments: Object.freeze(['synthetic', 'sandbox', 'security_lab'] as const),
      allowMutatingCapabilities: true,
      learningFeedbackAllowed: false,
      maxDeadlineMs: 60 * 60_000,
      maxToolCalls: 500,
    }),
    replay: Object.freeze({
      profile: 'replay',
      allowedEnvironments: Object.freeze(['synthetic', 'sandbox'] as const),
      allowMutatingCapabilities: false,
      learningFeedbackAllowed: false,
      maxDeadlineMs: 15 * 60_000,
      maxToolCalls: 100,
    }),
    evaluation_runtime: Object.freeze({
      profile: 'evaluation_runtime',
      allowedEnvironments: Object.freeze(['synthetic', 'sandbox'] as const),
      allowMutatingCapabilities: true,
      learningFeedbackAllowed: false,
      maxDeadlineMs: 60 * 60_000,
      maxToolCalls: 500,
    }),
  })

export type HarnessPolicyDecision =
  | { allowed: true; manifest: HarnessManifest }
  | { allowed: false; reasons: readonly string[] }

const clean = (value: unknown, max = 512): string => String(value ?? '').trim().slice(0, max)

function minDefined(...values: Array<number | undefined>): number | undefined {
  const valid = values.filter((value): value is number =>
    Number.isFinite(value) && Number(value) >= 0)
  return valid.length ? Math.min(...valid) : undefined
}

function constrainedLimits(
  requested: HarnessLimits | undefined,
  authority: HarnessLimits | undefined,
  profile: HarnessProfilePolicy,
): HarnessLimits {
  const maxCostUsd = minDefined(requested?.maxCostUsd, authority?.maxCostUsd)
  const maxToolCalls = minDefined(requested?.maxToolCalls, authority?.maxToolCalls, profile.maxToolCalls)
  const deadlineMs = minDefined(requested?.deadlineMs, authority?.deadlineMs, profile.maxDeadlineMs)
  const maxConcurrency = minDefined(requested?.maxConcurrency, authority?.maxConcurrency)

  return Object.freeze({
    ...(maxCostUsd !== undefined ? { maxCostUsd } : {}),
    ...(maxToolCalls !== undefined ? { maxToolCalls } : {}),
    ...(deadlineMs !== undefined ? { deadlineMs } : {}),
    ...(maxConcurrency !== undefined ? { maxConcurrency } : {}),
  })
}

/**
 * Resolve the executable manifest by intersection:
 *
 * requested work ∩ profile constraints ∩ trusted authority envelope.
 *
 * Any requested capability outside that intersection fails closed.
 */
export function resolveHarnessManifest(
  request: HarnessRunRequest,
  authority: HarnessAuthorityEnvelope,
): HarnessPolicyDecision {
  const reasons: string[] = []
  const profile = HARNESS_PROFILE_POLICIES[request.profile]
  const runId = clean(request.runId, 160)
  const objective = clean(request.objective, 4_000)
  const agentId = clean(request.identity.agentId, 240)
  const role = clean(request.identity.role, 240)

  if (!runId) reasons.push('run_id_missing')
  if (!objective) reasons.push('objective_missing')
  if (!agentId || !role) reasons.push('identity_missing')
  if (!authority.verified) reasons.push('authority_not_verified')
  if (!clean(authority.manifestRef, 1_024)) reasons.push('authority_manifest_missing')

  if (!profile.allowedEnvironments.includes(request.environment.class)) {
    reasons.push('profile_environment_forbidden')
  }
  if (!authority.environments.includes(request.environment.class)) {
    reasons.push('authority_environment_forbidden')
  }

  const authorityById = new Map(authority.capabilities.map(capability => [capability.id, capability]))
  const resolved = []
  const seen = new Set<string>()

  for (const rawCapabilityId of request.requestedCapabilities) {
    const capabilityId = clean(rawCapabilityId, 320)
    if (!capabilityId || seen.has(capabilityId)) continue
    seen.add(capabilityId)

    const capability = authorityById.get(capabilityId)
    if (!capability) {
      reasons.push(`capability_not_authorized:${capabilityId}`)
      continue
    }
    if (!capability.environments.includes(request.environment.class)) {
      reasons.push(`capability_environment_forbidden:${capabilityId}`)
      continue
    }
    if (capability.mutating && !profile.allowMutatingCapabilities) {
      reasons.push(`profile_mutation_forbidden:${capabilityId}`)
      continue
    }
    resolved.push(Object.freeze({
      ...capability,
      environments: Object.freeze([...capability.environments]),
    }))
  }

  if (reasons.length > 0) {
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons) })
  }

  return Object.freeze({
    allowed: true,
    manifest: Object.freeze({
      runId,
      objective,
      identity: Object.freeze({
        ...request.identity,
        agentId,
        role,
        ...(request.identity.artifact
          ? { artifact: Object.freeze({ ...request.identity.artifact }) }
          : {}),
      }),
      profile: request.profile,
      environment: Object.freeze({ ...request.environment }),
      capabilities: Object.freeze(resolved),
      authorityManifestRef: authority.manifestRef,
      ...(request.parent
        ? { parent: Object.freeze({ ...request.parent }) }
        : {}),
      limits: constrainedLimits(request.requestedLimits, authority.limits, profile),
      learningFeedbackAllowed: profile.learningFeedbackAllowed,
    }),
  })
}


const RISK_RANK: Readonly<Record<'read' | 'write' | 'consequential', number>> = Object.freeze({
  read: 0,
  write: 1,
  consequential: 2,
})

function childCapabilityDoesNotWiden(
  child: HarnessManifest['capabilities'][number],
  parent: HarnessManifest['capabilities'][number],
): boolean {
  if (child.mutating && !parent.mutating) return false
  if (RISK_RANK[child.risk ?? (child.mutating ? 'write' : 'read')]
    > RISK_RANK[parent.risk ?? (parent.mutating ? 'write' : 'read')]) return false
  if (child.environments.some(environment => !parent.environments.includes(environment))) return false

  const parentScopes = new Set(parent.scopes ?? [])
  if ((child.scopes ?? []).some(scope => !parentScopes.has(scope))) return false

  if (parent.preferredProviders?.length) {
    const parentProviders = new Set(parent.preferredProviders)
    if ((child.preferredProviders ?? []).some(provider => !parentProviders.has(provider))) return false
  }
  return true
}

function childLimitsDoNotWiden(
  child: HarnessLimits,
  parent: HarnessLimits,
): boolean {
  for (const key of ['maxCostUsd', 'maxToolCalls', 'deadlineMs', 'maxConcurrency'] as const) {
    const parentValue = parent[key]
    if (parentValue === undefined) continue
    const childValue = child[key]
    if (childValue === undefined || childValue > parentValue) return false
  }
  return true
}

/**
 * Resolve one delegated child run. A child may only reduce the parent's executable surface.
 * Separate child authority may further reduce the run, but it cannot add a capability, widen
 * scope/risk/mutation, escape the parent environment/profile/tenant, or loosen a hard limit.
 */
export function resolveChildHarnessManifest(
  request: HarnessRunRequest,
  authority: HarnessAuthorityEnvelope,
  parent: HarnessManifest,
): HarnessPolicyDecision {
  const reasons: string[] = []
  if (!request.parent) reasons.push('child_parent_missing')
  if (request.parent?.runId !== parent.runId) reasons.push('child_parent_run_mismatch')
  if (request.parent?.authorityManifestRef !== parent.authorityManifestRef) {
    reasons.push('child_parent_authority_mismatch')
  }
  if (request.profile !== parent.profile) reasons.push('child_profile_widening_forbidden')
  if (request.environment.class !== parent.environment.class) {
    reasons.push('child_environment_widening_forbidden')
  }
  if ((request.identity.tenantId ?? '') !== (parent.identity.tenantId ?? '')) {
    reasons.push('child_tenant_mismatch')
  }

  const parentById = new Map(parent.capabilities.map(capability => [capability.id, capability]))
  for (const rawId of request.requestedCapabilities) {
    const capabilityId = clean(rawId, 320)
    if (capabilityId && !parentById.has(capabilityId)) {
      reasons.push(`child_capability_widening_forbidden:${capabilityId}`)
    }
  }
  if (reasons.length) {
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons) })
  }

  const decision = resolveHarnessManifest(request, authority)
  if (decision.allowed === false) return decision

  for (const childCapability of decision.manifest.capabilities) {
    const parentCapability = parentById.get(childCapability.id)
    if (!parentCapability || !childCapabilityDoesNotWiden(childCapability, parentCapability)) {
      reasons.push(`child_capability_widening_forbidden:${childCapability.id}`)
    }
  }
  if (!childLimitsDoNotWiden(decision.manifest.limits, parent.limits)) {
    reasons.push('child_limits_widening_forbidden')
  }
  if (reasons.length) {
    return Object.freeze({ allowed: false, reasons: Object.freeze(reasons) })
  }

  return decision
}
