// saas/lib/supervisor/health-severity.ts
//
// NO CONSEQUENTIAL CLASSIFICATION WITHOUT VERIFICATION.
//
// The Supervisor already refuses to execute a repair it cannot validate against a registered
// capability, and refuses to report a repair verified unless a read-only check confirms it.
// Its own health reporting did not follow the same rule: a single internal condition firing
// set the platform state to "critical", with no check that anything was actually wrong.
//
// That produced a real defect. A scheduled observation run finishes, releases its lease and
// exits — which is correct behaviour — and the console reads "critical". An operator woken
// at 3am by that has no way to tell it from an outage, and the second time it happens they
// stop believing the console. An alarm that cannot be trusted is worse than no alarm,
// because it consumes the attention a real incident needs.
//
// THE RULE THIS FILE ENFORCES: severity is a function of VERIFIED IMPACT, not of an anomaly
// being present. Concretely —
//
//   critical       impact was CHECKED and CONFIRMED: work is blocked, or the condition has
//                  outlasted its own recovery path. Pages a human out of hours.
//   high           impact is plausible and the condition PERSISTED, but no confirmed blockage
//                  yet. Notifies on-call.
//   warning        real but not yet affecting anything. Business hours.
//   informational  expected for this deployment model. Recorded, never notified.
//   unverified     the checks could not be run, or the monitoring data itself is untrustworthy.
//                  Says exactly that, and NEVER borrows the word critical to cover it.
//
// "Unverified" existing at all is the point. The honest answer to "we cannot tell" is not to
// escalate and not to stay silent — it is to say the anomaly is unverified and name what
// could not be checked.
//
// EXPECTED CONDITIONS ARE NOT ANOMALIES. A scheduled runtime holds no lease between runs and
// its heartbeat ages: on a cron deployment that is the system working. The same fact on a
// continuously-running deployment is a genuine fault. So liveness is declared per instance
// rather than inferred from a single timeout, because a threshold that assumes a permanent
// process will call a healthy cron dead forever.
//
// PURE, AND NO IMPORTS. Classification is a decision, not an action: this file computes and
// returns, and the host decides what to display and who to wake.

export type HealthSeverity = 'informational' | 'warning' | 'high' | 'critical' | 'unverified'

/** How an instance is supposed to be alive. Declared, never guessed from a timeout. */
export type LivenessKind = 'continuous' | 'scheduled'

export type InstanceFact = {
  instanceId: string
  status: string
  /** Declared by the runtime itself. Defaults to continuous, which is the stricter reading. */
  liveness?: LivenessKind
  /** For a scheduled instance: how often it is supposed to run, in seconds. */
  scheduleIntervalSeconds?: number | null
  /**
   * Intervals of grace before late becomes absent. Supplied from the observation policy so
   * cadence and liveness are derived from ONE number; a separately configured grace period
   * is how the two drifted apart before.
   */
  stalenessMultiplier?: number | null
  lastHeartbeatAt?: string | null
  lastCompletedAt?: string | null
}

export type WorkFact = {
  workItemId: string
  state: string
  /** The lease that owns it, if any. Work with no owner is the thing that actually blocks. */
  ownedByLeaseId?: string | null
  updatedAt?: string | null
}

export type LeaseFact = {
  leaseId: string
  workItemId?: string | null
  status: string
  expiresAt?: string | null
  heartbeatAt?: string | null
}

export type AnomalyKind =
  | 'no_active_leader'
  | 'stale_heartbeat'
  | 'expired_lease'
  | 'audit_incomplete'
  | 'provider_registration_broken'

export type Anomaly = {
  kind: AnomalyKind
  subject: string
  /** How many consecutive observations have seen it. One is provisional, not persistent. */
  consecutiveObservations?: number
  /** Automatic recovery already attempted for this condition, if any. */
  recoveryAttempts?: number
  evidence?: string[]
}

export type SeverityInput = {
  anomalies: Anomaly[]
  instances: InstanceFact[]
  work: WorkFact[]
  leases: LeaseFact[]
  /** When the observation that produced these facts completed. */
  observedAt?: string | null
  /** The health snapshot's own self-check. If it failed, nothing here can be trusted. */
  monitoringTrustworthy?: boolean
  monitoringReasons?: string[]
  now?: Date
}

/** One question that was actually asked, and what came back. */
export type VerificationCheck = {
  id: string
  question: string
  result: 'pass' | 'fail' | 'unknown'
  detail: string
}

export type ClassifiedFinding = {
  kind: AnomalyKind
  subject: string
  severity: HealthSeverity
  /** True only when a check CONFIRMED impact. Never inferred from the anomaly existing. */
  impactVerified: boolean
  /** What an operator reads first: is anything actually broken. */
  impact: string
  affected: string[]
  checks: VerificationCheck[]
  confidence: 'high' | 'medium' | 'low'
  recoveryAttempts: number
  requiredAction: string
  /** Whether this justifies waking someone. Only critical does, by construction. */
  pageOutOfHours: boolean
  observedAt: string
}

export type PlatformStateReport = {
  /** The headline. "Operational" unless something was verified to be wrong. */
  state: 'operational' | 'degraded' | 'incident' | 'unknown'
  headline: string
  findings: ClassifiedFinding[]
  pageOutOfHours: boolean
  checkedAt: string
}

const DEFAULT_STALE_MULTIPLIER = 2.5 // a scheduled run may be late once; used only when policy is silent
const CONTINUOUS_HEARTBEAT_GRACE_MS = 90_000
const TERMINAL_WORK = new Set(['completed', 'failed', 'rejected', 'cancelled', 'archived'])

function ageMs(now: Date, value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? Math.max(0, now.getTime() - parsed) : Number.POSITIVE_INFINITY
}

function check(id: string, question: string, result: VerificationCheck['result'], detail: string): VerificationCheck {
  return { id, question, result, detail }
}

/** Work that is live and has nobody holding its lease. This is what "blocked" actually means. */
function blockedWork(input: SeverityInput): WorkFact[] {
  const activeLeases = new Set(
    input.leases.filter(lease => lease.status === 'active').map(lease => String(lease.workItemId || '')),
  )
  return input.work.filter(item => {
    if (TERMINAL_WORK.has(String(item.state))) return false
    const owner = item.ownedByLeaseId ? String(item.ownedByLeaseId) : ''
    if (owner) {
      return !input.leases.some(lease => lease.leaseId === owner && lease.status === 'active')
    }
    return !activeLeases.has(item.workItemId)
  })
}

/**
 * Is this instance absent, or simply between runs?
 *
 * A scheduled instance is judged against its own schedule: absent only once it has missed
 * the window it declared. A continuous one is judged against a heartbeat grace period. The
 * same elapsed time means opposite things in the two cases, which is precisely why the old
 * single threshold called a healthy cron dead.
 */
function instanceAbsent(instance: InstanceFact, now: Date): { absent: boolean; detail: string; expected: boolean } {
  const liveness: LivenessKind = instance.liveness === 'scheduled' ? 'scheduled' : 'continuous'
  const beat = ageMs(now, instance.lastHeartbeatAt || instance.lastCompletedAt)

  if (liveness === 'scheduled') {
    const interval = Number(instance.scheduleIntervalSeconds || 0) * 1000
    if (!interval) {
      return { absent: false, detail: 'Scheduled instance with no declared interval — cannot judge absence.', expected: false }
    }
    const multiplier = Number(instance.stalenessMultiplier || 0) > 0 ? Number(instance.stalenessMultiplier) : DEFAULT_STALE_MULTIPLIER
    const window = interval * multiplier
    if (beat > window) {
      return {
        absent: true,
        detail: `Last run ${Math.round(beat / 60000)}m ago against a ${Math.round(interval / 60000)}m schedule — the run window was missed.`,
        expected: false,
      }
    }
    return {
      absent: false,
      detail: `Last run ${Math.round(beat / 60000)}m ago against a ${Math.round(interval / 60000)}m schedule — within the expected window.`,
      expected: true,
    }
  }

  if (beat > CONTINUOUS_HEARTBEAT_GRACE_MS) {
    return { absent: true, detail: `No heartbeat for ${Math.round(beat / 1000)}s from a continuously-running instance.`, expected: false }
  }
  return { absent: false, detail: 'Heartbeat is current.', expected: false }
}

/**
 * Classify one anomaly by asking what it actually costs.
 *
 * Every branch records the questions it asked, so a finding can be audited afterwards rather
 * than believed. A finding with no checks is not a finding.
 */
function classify(anomaly: Anomaly, input: SeverityInput, now: Date): ClassifiedFinding {
  const observedAt = input.observedAt || now.toISOString()
  const checks: VerificationCheck[] = []
  const blocked = blockedWork(input)
  const persistent = Number(anomaly.consecutiveObservations || 1) >= 2
  const recoveryAttempts = Number(anomaly.recoveryAttempts || 0)

  const base = {
    kind: anomaly.kind,
    subject: anomaly.subject,
    recoveryAttempts,
    observedAt,
    affected: blocked.map(item => item.workItemId),
  }

  // The monitoring data has to be believable before anything is classified from it. This is
  // checked FIRST, because a confident severity computed from untrustworthy input is the
  // most expensive kind of wrong.
  if (input.monitoringTrustworthy === false) {
    checks.push(check('monitoring_trust', 'Is the monitoring data itself verified?', 'fail',
      (input.monitoringReasons || []).join(', ') || 'The health snapshot failed its own verification.'))
    return {
      ...base,
      affected: [],
      severity: 'unverified',
      impactVerified: false,
      impact: 'Impact could not be assessed — the monitoring data failed its own verification.',
      checks,
      confidence: 'low',
      requiredAction: 'Investigate the health pipeline before acting on this anomaly. Do not treat it as an outage and do not treat it as safe.',
      pageOutOfHours: false,
    }
  }
  checks.push(check('monitoring_trust', 'Is the monitoring data itself verified?', 'pass', 'The health snapshot passed its own verification.'))

  if (anomaly.kind === 'no_active_leader' || anomaly.kind === 'stale_heartbeat') {
    const instance = input.instances.find(item => item.instanceId === anomaly.subject) || input.instances[0]
    const liveness: LivenessKind = instance?.liveness === 'scheduled' ? 'scheduled' : 'continuous'
    const absence = instance
      ? instanceAbsent(instance, now)
      : { absent: true, detail: 'No instance record found at all.', expected: false }

    checks.push(check('liveness_model', 'How is this runtime supposed to be alive?', 'pass',
      liveness === 'scheduled'
        ? 'Declared scheduled — it is not expected to hold a lease or beat between runs.'
        : 'Declared continuous — it is expected to beat constantly.'))
    checks.push(check('absence', 'Has the runtime actually missed its expected liveness?',
      absence.absent ? 'fail' : 'pass', absence.detail))
    checks.push(check('blocked_work', 'Is any live work blocked with no owner?',
      blocked.length ? 'fail' : 'pass',
      blocked.length ? `${blocked.length} live work item(s) have no active lease.` : 'No live work item is without an owner.'))

    // Expected, and nothing waiting: this is the system working. It is recorded and it is
    // not an alarm.
    if (!absence.absent && !blocked.length) {
      return {
        ...base,
        affected: [],
        severity: 'informational',
        impactVerified: false,
        impact: 'No impact. No work is blocked and the runtime is within its expected schedule.',
        checks,
        confidence: 'high',
        requiredAction: 'None. This is expected for a scheduled runtime between runs.',
        pageOutOfHours: false,
      }
    }

    // Absent AND work stranded — this is the case that deserves a person out of bed.
    if (absence.absent && blocked.length) {
      return {
        ...base,
        severity: 'critical',
        impactVerified: true,
        impact: `${blocked.length} work item(s) are stranded with no owner while the runtime is absent.`,
        checks,
        confidence: 'high',
        requiredAction: recoveryAttempts
          ? `Automatic recovery has failed ${recoveryAttempts} time(s). Start the Supervisor runtime or approve failover.`
          : 'Start the Supervisor runtime or approve failover so the stranded work can be picked up.',
        pageOutOfHours: true,
      }
    }

    // Absent, but nothing waiting on it. Real, and it can wait for someone awake.
    if (absence.absent) {
      return {
        ...base,
        affected: [],
        severity: persistent ? 'high' : 'warning',
        impactVerified: false,
        impact: 'No work is blocked yet, but the runtime has missed its expected schedule, so new work would not be picked up.',
        checks,
        confidence: persistent ? 'high' : 'medium',
        requiredAction: persistent
          ? 'Check why the scheduled run is not firing. New work will queue until it does.'
          : 'Re-check at the next scheduled run before acting — a single missed window may be transient.',
        pageOutOfHours: false,
      }
    }

    // Work is stranded while the runtime looks fine — the coordination layer, not the runtime.
    return {
      ...base,
      severity: 'high',
      impactVerified: true,
      impact: `${blocked.length} work item(s) have no owner although the runtime is within its schedule.`,
      checks,
      confidence: 'medium',
      requiredAction: 'Investigate lease assignment: the runtime is alive but work is not being claimed.',
      pageOutOfHours: false,
    }
  }

  if (anomaly.kind === 'expired_lease') {
    const stranded = blocked.filter(item => (anomaly.evidence || []).includes(String(item.workItemId)))
    const anyStranded = stranded.length || blocked.length
    checks.push(check('lease_reconciled', 'Was the expired lease reconciled?',
      anyStranded ? 'fail' : 'pass',
      anyStranded ? 'Work from the expired lease has not been reclaimed.' : 'No work remains stranded by this lease.'))
    checks.push(check('blocked_work', 'Is any live work blocked with no owner?',
      blocked.length ? 'fail' : 'pass',
      blocked.length ? `${blocked.length} live work item(s) have no active lease.` : 'No live work item is without an owner.'))

    if (!anyStranded) {
      return {
        ...base,
        affected: [],
        severity: 'informational',
        impactVerified: false,
        impact: 'No impact. The lease expired after its work finished, which is the normal end of a run.',
        checks,
        confidence: 'high',
        requiredAction: 'None.',
        pageOutOfHours: false,
      }
    }
    return {
      ...base,
      severity: persistent ? 'critical' : 'high',
      impactVerified: true,
      impact: `${blocked.length} work item(s) are stranded by an expired lease.`,
      checks,
      confidence: 'high',
      requiredAction: 'Reconcile the expired lease so its work can be reclaimed.',
      pageOutOfHours: persistent,
    }
  }

  if (anomaly.kind === 'audit_incomplete') {
    // Nothing is down, but the product's central promise — signed, complete evidence — is
    // not being met. That is serious and it is not an outage, and conflating the two is how
    // an operator learns to ignore both.
    checks.push(check('service_impact', 'Is service affected by the missing audit evidence?', 'pass',
      'Audit completeness does not affect delivery; runs continue.'))
    checks.push(check('evidence_gap', 'Is the durable evidence trail incomplete?', 'fail',
      `${(anomaly.evidence || []).length || 1} run(s) have no terminal audit event.`))
    return {
      ...base,
      affected: anomaly.evidence || [],
      severity: persistent ? 'high' : 'warning',
      impactVerified: true,
      impact: 'No service impact. The audit trail is incomplete, which is a compliance and evidence problem rather than an outage.',
      checks,
      confidence: 'high',
      requiredAction: 'Investigate audit persistence before the next compliance review. Do not treat as an outage.',
      pageOutOfHours: false,
    }
  }

  if (anomaly.kind === 'provider_registration_broken') {
    checks.push(check('registration', 'Does a registered provider violate its declared limits?', 'fail',
      (anomaly.evidence || []).join(', ') || 'A provider registration failed its integrity check.'))
    checks.push(check('blocked_work', 'Is any live work blocked with no owner?',
      blocked.length ? 'fail' : 'pass',
      blocked.length ? `${blocked.length} live work item(s) have no active lease.` : 'No live work item is without an owner.'))
    return {
      ...base,
      affected: anomaly.evidence || [],
      severity: blocked.length ? 'critical' : 'high',
      impactVerified: blocked.length > 0,
      impact: blocked.length
        ? `A provider registration is invalid and ${blocked.length} work item(s) are stranded.`
        : 'No work is blocked. A provider registration violates its declared limits and must not be used until corrected.',
      checks,
      confidence: 'high',
      requiredAction: 'Correct the provider registration. Execution against it stays refused until it validates.',
      pageOutOfHours: blocked.length > 0,
    }
  }

  // An anomaly kind nobody taught this file about. It is NOT quietly downgraded, and it is
  // not promoted to critical either — it is named as unverified so a human decides.
  checks.push(check('known_kind', 'Is this anomaly type one we know how to verify?', 'unknown',
    `No verification path is defined for "${anomaly.kind}".`))
  return {
    ...base,
    affected: [],
    severity: 'unverified',
    impactVerified: false,
    impact: 'Impact unknown — this anomaly type has no defined verification.',
    checks,
    confidence: 'low',
    requiredAction: 'Investigate manually and add a verification path for this anomaly type.',
    pageOutOfHours: false,
  }
}

/**
 * The platform state an operator should be shown.
 *
 * "Operational" is the honest headline whenever nothing has been verified to be wrong —
 * including when anomalies exist. A console that says critical because a rule fired teaches
 * the operator that critical means nothing.
 */
export function classifyPlatformState(input: SeverityInput): PlatformStateReport {
  const now = input.now ? new Date(input.now) : new Date()
  const checkedAt = now.toISOString()
  const findings = (input.anomalies || []).map(anomaly => classify(anomaly, input, now))

  const critical = findings.filter(item => item.severity === 'critical')
  const high = findings.filter(item => item.severity === 'high')
  const unverified = findings.filter(item => item.severity === 'unverified')
  const warning = findings.filter(item => item.severity === 'warning')

  let state: PlatformStateReport['state'] = 'operational'
  let headline = 'Operational. No verified impact.'

  if (critical.length) {
    state = 'incident'
    headline = `${critical.length} verified impact${critical.length === 1 ? '' : 's'}: ${critical[0].impact}`
  } else if (unverified.length && !high.length) {
    // Said plainly rather than dressed up either way.
    state = 'unknown'
    headline = `${unverified.length} unverified anomal${unverified.length === 1 ? 'y' : 'ies'} — investigation required, no impact confirmed.`
  } else if (high.length) {
    state = 'degraded'
    headline = `${high.length} condition${high.length === 1 ? '' : 's'} need${high.length === 1 ? 's' : ''} attention. No work is blocked.`
  } else if (warning.length) {
    state = 'degraded'
    headline = `${warning.length} condition${warning.length === 1 ? '' : 's'} to review during business hours.`
  }

  return {
    state,
    headline,
    findings,
    // Only a verified impact wakes anyone. This is the single line that decides whether a
    // person's Saturday night is interrupted, so nothing else is allowed to set it.
    pageOutOfHours: findings.some(item => item.pageOutOfHours),
    checkedAt,
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Feeding this from the existing platform-health snapshot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Only the alerts that previously forced the word "critical" are re-classified here.
 * Everything else keeps the treatment it already had, so this file changes what a serious
 * claim requires rather than churning the whole console.
 */
const ALERT_TO_ANOMALY: Record<string, AnomalyKind> = {
  stale_lease: 'expired_lease',
  missing_heartbeat: 'stale_heartbeat',
  audit_persistence_failure: 'audit_incomplete',
  broken_bpal_registration: 'provider_registration_broken',
}

export function anomaliesFromPlatformAlerts(alerts: Array<{ type: string; severity?: string; subsystemId?: string; evidence?: string[] }>): Anomaly[] {
  const out: Anomaly[] = []
  for (const raw of alerts || []) {
    const kind = ALERT_TO_ANOMALY[String(raw.type)]
    if (!kind) continue
    out.push({
      kind,
      subject: (raw.evidence && raw.evidence[0]) || String(raw.subsystemId || raw.type),
      evidence: raw.evidence || [],
    })
  }
  return out
}

/**
 * Which instances are scheduled rather than continuously running, DECLARED by configuration.
 *
 * Format: "vercel-observation-cron:900,other-job:3600" — instance id, then its interval in
 * seconds. Anything not listed is treated as continuous, which is the stricter reading: an
 * undeclared runtime that goes quiet is still reported.
 *
 * Deliberately a declaration rather than a guess. Inferring "this looks like a cron" from an
 * instance name would be the same class of error as the fixed timeout it replaces — a rule
 * that is right until it silently is not, on a runtime nobody remembered to name carefully.
 */
export function parseScheduledInstances(value: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const entry of String(value || '').split(',')) {
    const [id, seconds] = entry.split(':')
    const name = String(id || '').trim()
    const interval = Number(String(seconds || '').trim())
    if (name && Number.isFinite(interval) && interval > 0) out[name] = interval
  }
  return out
}
