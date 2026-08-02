// saas/lib/supervisor/observation-policy.ts
//
// THE SINGLE SOURCE OF TRUTH FOR HOW OFTEN A RUNTIME IS DUE TO OBSERVE.
//
// Two consumers, one record. The scheduler asks "is an observation due?" — so the platform
// cron becomes a tick that may fire as often as it likes, and the policy decides. The health
// check asks "how late may this runtime be before it is absent?" — and derives its window
// from the same interval. Because both read one row, they cannot disagree about what late
// means, which is the failure the previous arrangement had: an interval declared in two
// places drifts, and it drifts toward reporting healthy while a runtime is stopped.
//
// DEFAULTS ARE STATED, NOT SILENT. When no policy row exists the defaults below apply and
// the result says `source: 'default'`, so a console can show that a cadence was assumed
// rather than chosen. An assumed number presented as a decision is how a reviewer ends up
// asking "who picked 15 minutes?" and nobody knows.
//
// NEVER THROWS. Storage being unavailable must not stop an observation from running — it
// falls back to defaults and reports that it did. The alternative is a supervisor that stops
// supervising because it could not read its own configuration.

type AnyClient = { from: (table: string) => any }

const TABLE = 'supervisor_observation_policy'

export type ObservationPolicy = {
  instanceId: string
  environment: string
  intervalSeconds: number
  stalenessMultiplier: number
  missedRunIsIncident: boolean
  enabled: boolean
  rationale: string | null
  source: 'policy' | 'default'
}

/**
 * Applied when nothing is configured.
 *
 * Fifteen minutes is a judgement, not a constant handed down: a failed deployment is worth
 * catching inside one release cycle, and each run costs an invocation plus provider calls.
 * Tighter than five minutes buys little detection for meaningfully more spend; looser than
 * an hour lets a bad deploy sit unobserved through a working morning.
 */
export const DEFAULT_OBSERVATION_POLICY = {
  intervalSeconds: 900,
  stalenessMultiplier: 2.5,
  missedRunIsIncident: true,
  enabled: true,
}

function toPolicy(row: any): ObservationPolicy {
  return {
    instanceId: String(row.instance_id),
    environment: String(row.environment || 'production'),
    intervalSeconds: Number(row.interval_seconds) || DEFAULT_OBSERVATION_POLICY.intervalSeconds,
    stalenessMultiplier: Number(row.staleness_multiplier) || DEFAULT_OBSERVATION_POLICY.stalenessMultiplier,
    missedRunIsIncident: row.missed_run_is_incident !== false,
    enabled: row.enabled !== false,
    rationale: row.rationale || null,
    source: 'policy',
  }
}

export function defaultPolicyFor(instanceId: string, environment = 'production'): ObservationPolicy {
  return {
    instanceId,
    environment,
    ...DEFAULT_OBSERVATION_POLICY,
    rationale: null,
    source: 'default',
  }
}

/** Every configured policy. Used by the console and by the health check. */
export async function listObservationPolicies(admin: AnyClient): Promise<ObservationPolicy[]> {
  try {
    const { data } = await admin.from(TABLE).select('*').order('instance_id', { ascending: true })
    return (data || []).map(toPolicy)
  } catch {
    return []
  }
}

export async function getObservationPolicy(
  admin: AnyClient,
  instanceId: string,
  environment = 'production',
): Promise<ObservationPolicy> {
  try {
    const { data } = await admin
      .from(TABLE)
      .select('*')
      .eq('instance_id', instanceId)
      .eq('environment', environment)
      .maybeSingle()
    if (data) return toPolicy(data)
  } catch {
    // Fall through to the stated default rather than refusing to observe.
  }
  return defaultPolicyFor(instanceId, environment)
}

export type DueDecision = {
  due: boolean
  reason: string
  /** Seconds until the next run is due. Zero when it is due now. */
  waitSeconds: number
  policy: ObservationPolicy
}

/**
 * Should this tick actually observe?
 *
 * The platform scheduler is deliberately allowed to fire more often than the policy — a
 * five-minute cron with a fifteen-minute policy simply skips two ticks. That decoupling is
 * what makes cadence changeable without a redeploy, and it means a buyer whose scheduler has
 * a coarser granularity than ours still gets the cadence they configured.
 */
export function observationDue(policy: ObservationPolicy, lastRunAt: string | null | undefined, now = new Date()): DueDecision {
  if (!policy.enabled) {
    return { due: false, reason: 'Observation is disabled by policy for this runtime.', waitSeconds: 0, policy }
  }
  if (!lastRunAt) {
    return { due: true, reason: 'No previous observation recorded.', waitSeconds: 0, policy }
  }
  const parsed = Date.parse(lastRunAt)
  if (!Number.isFinite(parsed)) {
    // An unreadable timestamp is treated as "observe now". Skipping because a value could
    // not be parsed would mean a corrupt record silently stops supervision.
    return { due: true, reason: 'Last observation timestamp could not be read; observing.', waitSeconds: 0, policy }
  }
  const elapsed = Math.max(0, now.getTime() - parsed) / 1000
  if (elapsed >= policy.intervalSeconds) {
    return { due: true, reason: `${Math.round(elapsed)}s since the last observation, policy is ${policy.intervalSeconds}s.`, waitSeconds: 0, policy }
  }
  return {
    due: false,
    reason: `Observed ${Math.round(elapsed)}s ago; the next run is due in ${Math.round(policy.intervalSeconds - elapsed)}s.`,
    waitSeconds: Math.round(policy.intervalSeconds - elapsed),
    policy,
  }
}

/**
 * How long a runtime may be silent before the health check calls it absent.
 *
 * Derived, never configured separately — that separation is what let the two disagree.
 */
export function absenceWindowSeconds(policy: ObservationPolicy): number {
  return Math.round(policy.intervalSeconds * policy.stalenessMultiplier)
}

/** The shape the health classifier wants, built from policy so the numbers cannot drift. */
export function livenessFromPolicies(policies: ObservationPolicy[]): Record<string, { intervalSeconds: number; stalenessMultiplier: number }> {
  const out: Record<string, { intervalSeconds: number; stalenessMultiplier: number }> = {}
  for (const policy of policies) {
    if (!policy.enabled) continue
    out[policy.instanceId] = {
      intervalSeconds: policy.intervalSeconds,
      stalenessMultiplier: policy.stalenessMultiplier,
    }
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Where the observation actually stands
// ─────────────────────────────────────────────────────────────────────────────
//
// "Next observation: Due now" printed beside "Missed scheduled observations: 1" is a
// contradiction on the face of it. Both lines were true and neither was useful, because
// "due" answers a scheduler's question — should I run — and an operator is asking a
// different one: am I inside tolerance, and how long until this escalates?
//
// THREE STATES, FROM THE SAME TWO NUMBERS THE POLICY ALREADY DECLARES.
//
//   on_schedule  Elapsed is under the interval. Nothing is owed yet.
//   overdue      A run is owed and has not happened, but the runtime is still inside its
//                absence window. This is the state that used to read "Due now" and be
//                mistaken for "on time".
//   absent       Elapsed has passed interval × staleness multiplier. The runtime is no
//                longer merely late; it has stopped being observed.
//
// TOLERANCE IS THE SPAN BETWEEN DUE AND ABSENT, and escalation is the moment it ends. Both
// are derived from the declared cadence, so the console cannot state a tolerance the
// scheduler does not actually honour.

export type ObservationState = 'on_schedule' | 'overdue' | 'absent'

export type ObservationTiming = {
  state: ObservationState
  /** Seconds since the last completed observation. */
  elapsedSeconds: number
  intervalSeconds: number
  /** How long a run may be owed before the runtime is called absent. */
  toleranceSeconds: number
  /** Seconds past the point the run became due. Zero when on schedule. */
  overdueSeconds: number
  /** Seconds until absent. Zero once that threshold has passed. */
  escalatesInSeconds: number
  /** True when this runtime has stopped being observed, not merely run late. */
  windowMissed: boolean
  policy: ObservationPolicy
}

/**
 * Where the observation stands, in the terms an operator asks about.
 *
 * A never-observed or unreadable timestamp is reported as ABSENT rather than on schedule.
 * The failure of the opposite default is the one that hides a runtime that never started.
 */
export function observationTiming(
  policy: ObservationPolicy,
  lastRunAt: string | null | undefined,
  now = new Date(),
): ObservationTiming {
  const absence = absenceWindowSeconds(policy)
  const tolerance = Math.max(0, absence - policy.intervalSeconds)
  const parsed = Date.parse(lastRunAt || '')
  if (!Number.isFinite(parsed)) {
    return {
      state: 'absent',
      elapsedSeconds: 0,
      intervalSeconds: policy.intervalSeconds,
      toleranceSeconds: tolerance,
      overdueSeconds: 0,
      escalatesInSeconds: 0,
      windowMissed: true,
      policy,
    }
  }
  const elapsed = Math.max(0, Math.round((now.getTime() - parsed) / 1000))
  const state: ObservationState =
    elapsed >= absence ? 'absent' : elapsed >= policy.intervalSeconds ? 'overdue' : 'on_schedule'
  return {
    state,
    elapsedSeconds: elapsed,
    intervalSeconds: policy.intervalSeconds,
    toleranceSeconds: tolerance,
    overdueSeconds: Math.max(0, elapsed - policy.intervalSeconds),
    escalatesInSeconds: Math.max(0, absence - elapsed),
    windowMissed: state === 'absent',
    policy,
  }
}
