// saas/lib/supervisor/operational-assessment.ts
//
// TWO MEASUREMENTS, NOT ONE NUMBER.
//
// A single "health" figure has been forcing two unrelated facts through one channel, and the
// console has been contradicting itself as a result: "no work is blocked yet" printed beside
// "supervisor 70%" and "health 93%". Those are not degrees of the same thing.
//
//   OPERATIONAL STATE       Is the business affected? Answered only from VERIFIED impact —
//                           blocked work, confirmed service failure, reduced capability.
//                           This is what an operator acts on at 3am.
//
//   OBSERVATION CONFIDENCE  How much do we trust what we just said? Answered from the
//                           completeness and freshness of our own evidence — observations
//                           owed and not taken, liveness we could not establish, domains we
//                           do not measure.
//
// A bank can be fully OPERATIONAL while confidence sits at 93% because one scheduled
// observation was missed. The reverse also holds and matters more: confidence can be 100%
// precisely BECAUSE every observation agrees the platform is in an outage. Collapsing the two
// into one percentage makes both unreadable.
//
// WHAT THIS FIXES CONCRETELY. A missed heartbeat used to lower "health", which reads as the
// platform being less well. It does not make the platform less well. It makes us less sure —
// and the honest response is to say so, not to imply a degradation nobody has verified.
//
// CONFIDENCE IS A LEDGER, LIKE THE SCORE. Every point deducted names its cause and what would
// restore it. A confidence figure nobody can decompose is the same decoration the health
// score was.
//
// PURE, NO IMPORTS.

export type OperationalState = 'operational' | 'operational_risk' | 'service_degraded' | 'outage'

export const OPERATIONAL_STATE_LABELS: Record<OperationalState, string> = {
  operational: 'Operational',
  operational_risk: 'Operational — risk identified',
  service_degraded: 'Service degraded',
  outage: 'Outage',
}

/** What each state means for the person reading it, in one line. */
export const OPERATIONAL_STATE_MEANINGS: Record<OperationalState, string> = {
  operational: 'The business is operating. Nothing is blocked.',
  operational_risk: 'The business is operating. A condition exists that would block work if it continues.',
  service_degraded: 'Something is working less well or not at all, and work is still flowing.',
  outage: 'Work is blocked. Service continuity is affected.',
}

export type ConfidenceReason = {
  code: string
  label: string
  /** Points of confidence lost. The ledger sums to the figure shown. */
  penalty: number
  why: string
  /** What would restore it. A reason with no remedy is a shrug. */
  remedy: string
}

export type EvidenceLine = { label: string; value: string }

export type OperationalAssessment = {
  state: OperationalState
  stateLabel: string
  stateMeaning: string
  /** Why this state and not another, in the operator's terms. */
  stateReason: string

  /** 0–100. How far our evidence can be trusted — NOT how well the platform is running. */
  confidence: number
  confidenceReasons: ConfidenceReason[]
  confidenceStatement: string

  /** The facts the state rests on. Shown so the assessment can be checked, not believed. */
  verifiedBy: EvidenceLine[]

  operatorAction: string
  pageOnCall: boolean
}

export type AssessmentInput = {
  /** Live work with no owner. The single fact that makes an outage an outage. */
  blockedWork?: number
  /** Failures confirmed against the provider, not inferred. */
  confirmedServiceFailures?: number
  /** Things that work less well without blocking anything — a refused provider, say. */
  reducedCapabilities?: string[]
  /** Conditions that would block work if they persist. Risk, not degradation. */
  riskConditions?: string[]

  // ── Evidence quality ───────────────────────────────────────────────────────
  observationsExpected?: number
  observationsCompleted?: number
  /** Runtimes whose liveness could not be established at all. */
  unverifiableLiveness?: string[]
  /** Domains with no independent signal. */
  unmeasuredDomains?: string[]
  verificationAttempted?: number
  verificationFailed?: number
  /** Runs with no terminal audit record — evidence we cannot replay. */
  auditGaps?: number

  queueDepth?: number
}

// The cost of each kind of missing evidence. Stated here rather than scattered, because a
// confidence figure is only defensible if its arithmetic is inspectable — and these should
// eventually be policy a buyer can tune, not constants we chose.
const PENALTY = {
  missedObservation: 7,      // per owed observation that did not happen
  missedObservationCap: 40,
  unverifiableLiveness: 15,  // per runtime we cannot judge at all
  unmeasuredDomain: 4,       // per domain with no independent signal
  verificationFailures: 25,  // scaled by the failure ratio
  auditGap: 5,               // per run with no durable record, capped
  auditGapCap: 15,
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

/**
 * Confidence in our own evidence, as a ledger.
 *
 * Nothing here reflects on the platform. Every entry is a statement about what we failed to
 * observe, and each carries the action that would restore the missing evidence.
 */
export function assessObservationConfidence(input: AssessmentInput): { confidence: number; reasons: ConfidenceReason[] } {
  const reasons: ConfidenceReason[] = []

  const expected = Number(input.observationsExpected || 0)
  const completed = Number(input.observationsCompleted || 0)
  const missed = Math.max(0, expected - completed)
  if (missed > 0) {
    reasons.push({
      code: 'missed_observations',
      label: missed === 1 ? 'One expected observation window was missed' : `${missed} expected observation windows were missed`,
      penalty: Math.min(missed * PENALTY.missedObservation, PENALTY.missedObservationCap),
      why: 'We are reporting on a platform we have looked at less often than policy requires. Nothing here says the platform changed.',
      remedy: 'The next successful observation restores this automatically.',
    })
  }

  for (const runtime of input.unverifiableLiveness || []) {
    reasons.push({
      code: 'unverifiable_liveness',
      label: `Liveness could not be established for ${runtime}`,
      penalty: PENALTY.unverifiableLiveness,
      why: 'The evidence this trigger model needs was not supplied, so its state is unknown rather than good.',
      remedy: 'Supply the signal the model requires — a poll time, a reachability probe, a heartbeat.',
    })
  }

  const unmeasured = input.unmeasuredDomains || []
  if (unmeasured.length) {
    reasons.push({
      code: 'unmeasured_domains',
      label: `${unmeasured.length} domain(s) have no independent signal`,
      penalty: unmeasured.length * PENALTY.unmeasuredDomain,
      why: `Not measured: ${unmeasured.join(', ')}. An unmeasured domain is not evidence of health.`,
      remedy: 'Collect the missing signals rather than inferring them from a neighbouring measurement.',
    })
  }

  const attempted = Number(input.verificationAttempted || 0)
  const failed = Number(input.verificationFailed || 0)
  if (attempted > 0 && failed > 0) {
    reasons.push({
      code: 'verification_failures',
      label: `${failed} of ${attempted} verifications failed`,
      penalty: Math.round((failed / attempted) * PENALTY.verificationFailures),
      why: 'An unverified outcome is unproven. It is not evidence of failure, and it is not evidence of success either.',
      remedy: 'Re-verify. Treat the affected outcomes as unproven until it succeeds.',
    })
  }

  const gaps = Number(input.auditGaps || 0)
  if (gaps > 0) {
    reasons.push({
      code: 'audit_gaps',
      label: `${gaps} run(s) have no durable record`,
      penalty: Math.min(gaps * PENALTY.auditGap, PENALTY.auditGapCap),
      why: 'Those outcomes cannot be replayed or audited later, which limits what can be proven about this window.',
      remedy: 'Investigate audit persistence. This does not affect service.',
    })
  }

  const lost = reasons.reduce((total, reason) => total + reason.penalty, 0)
  return { confidence: clamp(100 - lost), reasons }
}

/**
 * The operational state, from verified impact only.
 *
 * Nothing about evidence quality reaches this function. A platform we can barely see is not
 * thereby degraded — it is a platform we are less sure about, which is the other measurement.
 */
export function assessOperationalState(input: AssessmentInput): { state: OperationalState; reason: string } {
  const blocked = Number(input.blockedWork || 0)
  const failures = Number(input.confirmedServiceFailures || 0)
  const reduced = input.reducedCapabilities || []
  const risks = input.riskConditions || []

  if (blocked > 0 || failures > 0) {
    return {
      state: 'outage',
      reason: blocked > 0
        ? `${blocked} work item(s) are blocked with no owner.`
        : `${failures} service failure(s) confirmed against the provider.`,
    }
  }
  if (reduced.length) {
    return {
      state: 'service_degraded',
      reason: `Reduced capability: ${reduced.join(', ')}. Work is still flowing.`,
    }
  }
  if (risks.length) {
    return {
      state: 'operational_risk',
      reason: `${risks.join('; ')}. Nothing is blocked.`,
    }
  }
  return { state: 'operational', reason: 'No blocked work, no confirmed service failure, no reduced capability.' }
}

/**
 * The whole assessment: what is happening, how sure we are, and what the operator does.
 *
 * PAGING IS DECIDED BY STATE ALONE. Low confidence never wakes anyone — being unsure at 3am
 * is not an emergency, and a system that pages on its own blind spots teaches people to
 * silence it.
 */
export function buildOperationalAssessment(input: AssessmentInput): OperationalAssessment {
  const { state, reason } = assessOperationalState(input)
  const { confidence, reasons } = assessObservationConfidence(input)

  const pageOnCall = state === 'outage'
  const operatorAction =
    state === 'outage'
      ? 'Free the blocked work, or approve failover. This is the one state that justifies waking someone.'
      : state === 'service_degraded'
        ? 'Restore the reduced capability during working hours. Work is still flowing.'
        : state === 'operational_risk'
          ? 'Watch it. Escalate only if the condition persists past the next observation.'
          : 'None. Continue monitoring.'

  const verifiedBy: EvidenceLine[] = [
    { label: 'Blocked work', value: String(Number(input.blockedWork || 0)) },
    { label: 'Queue depth', value: String(Number(input.queueDepth || 0)) },
    {
      label: 'Observations',
      value: `${Number(input.observationsCompleted || 0)} of ${Number(input.observationsExpected || 0)} owed`,
    },
    {
      label: 'Verification',
      value: Number(input.verificationAttempted || 0) > 0
        ? `${Math.round(((Number(input.verificationAttempted) - Number(input.verificationFailed || 0)) / Number(input.verificationAttempted)) * 100)}% of ${input.verificationAttempted}`
        : 'none attempted',
    },
  ]

  const confidenceStatement =
    confidence >= 100
      ? 'Full confidence — every expected observation was taken and every domain is measured.'
      : reasons.length === 1
        ? `Reduced by one condition: ${reasons[0].label.toLowerCase()}.`
        : `Reduced by ${reasons.length} conditions, listed below. None of them is a statement about the platform.`

  return {
    state,
    stateLabel: OPERATIONAL_STATE_LABELS[state],
    stateMeaning: OPERATIONAL_STATE_MEANINGS[state],
    stateReason: reason,
    confidence,
    confidenceReasons: reasons,
    confidenceStatement,
    verifiedBy,
    operatorAction,
    pageOnCall,
  }
}

/** "Operational · 93% confidence" — the one line a collapsed card should show. */
export function assessmentHeadline(assessment: OperationalAssessment): string {
  return `${assessment.stateLabel} · ${assessment.confidence}% confidence`
}
