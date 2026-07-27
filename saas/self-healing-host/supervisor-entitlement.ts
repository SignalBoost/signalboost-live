// saas/self-healing-host/supervisor-entitlement.ts
//
// WHERE THE LICENCE IS ACTUALLY ENFORCED.
//
// The licensing layer has existed for a while — signed offline tokens, a feature
// catalogue, editions, revocation, and a guard that refuses at the point of execution.
// What it did NOT have was a caller. `licensingAvailable: true` on the manifest meant
// "we can issue a licence", not "unlicensed use is prevented". This file is the
// difference between those two sentences.
//
// THE ENFORCEMENT POINTS, chosen from what the code actually does today:
//   repair.plan     — proposing a repair plan (the Thinker)
//   repair.dispatch — dispatching one (the SupervisorDispatcher)
//
// NOT enforced, and deliberately so, per the rules written into the catalogue:
// observing incidents, exporting audit to a SIEM, and the approval gate itself are
// alwaysIncluded in every edition. Charging a buyer for the ability to see what
// happened in their own infrastructure turns a licence into leverage during an
// incident, and there is no edition in which consequential steps run without a named
// human. The gate's own alwaysAllowed defaults ('read', 'observe') reinforce it.
//
// FAIL-CLOSED WHEN UNCONFIGURED. With no token installed, paid actions refuse. That
// is the correct posture for a product that will sit in someone else's data centre —
// a licence check that silently passes when misconfigured is not a licence check. It
// applies to this deployment too: the vendor licenses itself like anyone else, which
// is also the only way we ever exercise the path a buyer walks.

import {
  createEntitlementGate,
  guardWithEntitlement,
  type EntitlementGate,
  type EntitlementRefusal,
} from '@/portable-license'

export const SELF_HEALING_PRODUCT_ID = 'self-healing-supervisor'

export interface EntitlementWiring {
  gate: EntitlementGate | null
  configured: boolean
  /** Why there is no gate, in words an operator can act on. Empty when configured. */
  reason: string
}

/**
 * Public keys are supplied as PEM. Several are accepted so a key can be rotated
 * without a window where every deployment refuses; they are separated by a comma or
 * by a literal '\n\n' since environment variables are awkward with real newlines.
 */
function publicKeys(): string[] {
  const raw = String(process.env.SUPERVISOR_LICENSE_PUBLIC_KEYS || process.env.SUPERVISOR_LICENSE_PUBLIC_KEY || '')
  return raw
    .split(/,|\|\|/)
    .map(value => value.trim().replace(/\\n/g, '\n'))
    .filter(value => value.includes('BEGIN PUBLIC KEY'))
}

let cached: EntitlementWiring | null = null

export function getSupervisorEntitlement(): EntitlementWiring {
  if (cached) return cached

  const token = String(process.env.SUPERVISOR_LICENSE_TOKEN || '').trim()
  const issuer = String(process.env.SUPERVISOR_LICENSE_ISSUER || '').trim()
  const keys = publicKeys()

  // Each missing piece is named separately. "Licensing is not configured" sends an
  // operator hunting; "SUPERVISOR_LICENSE_TOKEN is not set" does not.
  const missing: string[] = []
  if (!token) missing.push('SUPERVISOR_LICENSE_TOKEN')
  if (!issuer) missing.push('SUPERVISOR_LICENSE_ISSUER')
  if (keys.length === 0) missing.push('SUPERVISOR_LICENSE_PUBLIC_KEYS (PEM)')

  if (missing.length > 0) {
    cached = { gate: null, configured: false, reason: `not set: ${missing.join(', ')}` }
    return cached
  }

  try {
    cached = {
      gate: createEntitlementGate({ productId: SELF_HEALING_PRODUCT_ID, issuer, publicKeysPem: keys, token }),
      configured: true,
      reason: '',
    }
  } catch (error) {
    // A malformed key must not throw on the first incident of the day. It becomes an
    // unconfigured gate with a reason, and paid actions refuse exactly as they would
    // with no licence at all.
    cached = { gate: null, configured: false, reason: error instanceof Error ? error.message : 'invalid licence configuration' }
  }
  return cached
}

export function resetSupervisorEntitlementForTests(): void { cached = null }

/**
 * A gate that refuses every paid action, used when nothing is configured.
 *
 * This exists so the call sites below have ONE shape to code against rather than a
 * null check at each one — a licence check that can be skipped by forgetting an `if`
 * is the failure this whole file is meant to remove. Read and observe still pass,
 * matching the catalogue's always-included rule.
 */
function refusingGate(reason: string): EntitlementGate {
  const verdict = {
    entitled: false,
    state: 'missing' as const,
    features: [] as string[],
    licenseId: '',
    reason,
  }
  return {
    async status() { return verdict as never },
    async check(action: string, actionClass: 'read' | 'observe' | 'execute' | 'dispatch' = 'execute') {
      const allowed = actionClass === 'read' || actionClass === 'observe'
      return { allowed, verdict: verdict as never, reason: allowed ? '' : `no licence installed (${reason})` }
    },
    async assertEntitled(action: string, actionClass: 'read' | 'observe' | 'execute' | 'dispatch' = 'execute') {
      if (actionClass === 'read' || actionClass === 'observe') return
      const error = new Error(`${action} requires a licence — ${reason}`) as Error & { state?: string; actionClass?: string }
      error.name = 'EntitlementError'
      error.state = 'missing'
      error.actionClass = actionClass
      throw error
    },
    async hasFeature() { return false },
    async describe() { return `self-healing-supervisor: no licence installed (${reason})` },
    invalidate() {},
  } as unknown as EntitlementGate
}

export function supervisorGate(): EntitlementGate {
  const wiring = getSupervisorEntitlement()
  return wiring.gate ?? refusingGate(wiring.reason)
}

/**
 * Wrap anything with a `proposeRepairPlan` method so producing a repair plan requires
 * the repair.plan feature. The orchestrator awaits the Thinker, which is what makes
 * this safe — the guard returns a promise for every method it wraps.
 */
export function licensedThinker<T extends object>(thinker: T, onRefusal?: (event: EntitlementRefusal) => void): T {
  return guardWithEntitlement(thinker, {
    gate: supervisorGate(),
    classify: { proposeRepairPlan: { actionClass: 'execute', feature: 'repair.plan' } },
    onRefusal,
  })
}

/** Wrap a SupervisorDispatcher so `dispatch` requires the repair.dispatch feature. */
export function licensedDispatcher<T extends object>(dispatcher: T, onRefusal?: (event: EntitlementRefusal) => void): T {
  return guardWithEntitlement(dispatcher, {
    gate: supervisorGate(),
    classify: { dispatch: { actionClass: 'dispatch', feature: 'repair.dispatch' } },
    onRefusal,
  })
}
