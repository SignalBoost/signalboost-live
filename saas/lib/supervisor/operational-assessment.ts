// saas/lib/supervisor/operational-assessment.ts
//
// FOUR ANSWERS, KEPT APART.
//
// A single "health" figure was forcing unrelated facts through one channel, and the console
// contradicted itself as a result: "no work is blocked" printed beside "supervisor 70%" and
// "health 93%". Those are not degrees of the same thing. This file produces three of the four
// answers the console gives; the fourth lives in risk-forecast.ts.
//
//   CURRENT STATE       Is the business affected RIGHT NOW? Answered only from VERIFIED
//                       impact — blocked work, confirmed service failure, reduced capability.
//                       This is what an operator acts on at 3am.
//
//   CURRENT IMPACT      Stated separately and in plain words, because "Operational" answers
//                       a different question from "is anything affected".
//
//   ASSESSMENT BASIS    The facts the conclusion rests on, INCLUDING the ones that limit it.
//                       An operator should never have to hunt through subsystem cards to find
//                       out why the top of the page says what it says.
//
//   OBSERVATION         How much do we trust what we just said? Answered from the
//   CONFIDENCE          completeness and freshness of our own evidence — observations owed
//                       and not taken, liveness we could not establish, domains we do not
//                       measure.
//
// WHAT CHANGED HERE, AND WHY IT MATTERS MORE THAN IT LOOKS.
//
// There used to be a fourth state, `operational_risk`, carrying a line like "the runtime has
// missed its schedule, so new work would not be picked up". That sentence is a FORECAST. It
// describes a future that has not happened, under a condition that may not hold. Printing it
// as current state is what made the console say "attention required" above "nothing is
// blocked". The state enum now has three values, all of them describing the present, and
// every forecast has moved to risk-forecast.ts where it is labelled as one.
//
// A bank can be fully OPERATIONAL while confidence sits at 93% because one scheduled
// observation was missed. The reverse also holds and matters more: confidence can be 100%
// precisely BECAUSE every observation agrees the platform is in an outage.
//
// CONFIDENCE IS A LEDGER, LIKE THE SCORE. Every point deducted names its cause and what would
// restore it. A confidence figure nobody can decompose is the same decoration the health
// score was.
//
// PURE, NO IMPORTS.

export type OperationalState = 'operational' | 'service_degraded' | 'outage'

export const OPERATIONAL_STATE_LABELS: Record<OperationalState, string> = {
  operational: 'Operational',
  service_degraded: 'Service degraded',
  outage: 'Outage',
}

/** What each state means for the person reading it, in one line. */
export const OPERATIONAL_STATE_MEANINGS: Record<OperationalState, string> = {
  operational: 'The business is operating. Nothing is blocked.',
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

/**
 * A fact the assessment rests on.
 *
 * `polarity` is the part that earns its place: a basis that lists only the reassuring figures
 * is a sales page. "1 missed scheduled observation" belongs in the same block as "50
 * successful observations", marked as what it is — something that limits the conclusion
 * rather than supporting it.
 */
export type BasisLine = {
  label: string
  value: string
  polarity: 'supports' | 'limits'
}

export type EvidenceLine = { label: string; value: string }

export type OperationalAssessment = {
  state: OperationalState
  stateLabel: string
  stateMeaning: string
  /** Why this state and not another, in the operator's terms. */
  stateReason: string
  /** True when the state was reached from checks that all ran. */
  stateVerified: boolean

  /** Answered separately from the state, in words an operations manager uses. */
  impact: string
  impactAffected: boolean

  /** Everything the conclusion rests on, supporting and limiting, in one block. */
  assessmentBasis: BasisLine[]
  /** The lead-in sentence for that block. */
  basisStatement: string

  /** 0–100. How far our evidence can be trusted — NOT how well the platform is running. */
  confidence: number
  confidenceReasons: ConfidenceReason[]
  confidenceStatement: string

  /** The supporting subset of the basis, kept for callers that want only verified facts. */
  verifiedBy: EvidenceLine[]

  operatorAction: string
  pageOnCall: boolean
  /** Why this page is showing what it is showing, in one sentence. */
  whyAmISeeingThis: string
}

export type AssessmentInput = {
  /** Live work with no owner. The single fact that makes an outage an outage. */
  blockedWork?: number
  /** Failures confirmed against the provider, not inferred. */
  confirmedServiceFailures?: number
  /** Things that work less well without blocking anything — a refused provider, say. */
  reducedCapabilities?: string[]

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
  /** Number of forecast conditions, for the "why am I seeing this" line only. Never for state. */
  riskForecastCount?: number
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
 * Nothing about evidence quality reaches this function, and nothing about the future does
 * either. A platform we can barely see is not thereby degraded — it is a platform we are less
 * sure about. A platform that MIGHT stop collecting work tomorrow is not degraded today.
 * Those are the other two axes.
 */
export function assessOperationalState(input: AssessmentInput): { state: OperationalState; reason: string } {
  const blocked = Number(input.blockedWork || 0)
  const failures = Number(input.confirmedServiceFailures || 0)
  const reduced = input.reducedCapabilities || []

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
  return { state: 'operational', reason: 'No blocked work, no confirmed service failure, no reduced capability.' }
}

/** Business impact in the words an operations manager would use, stated separately from state. */
export function assessImpact(input: AssessmentInput): { impact: string; affected: boolean } {
  const blocked = Number(input.blockedWork || 0)
  const failures = Number(input.confirmedServiceFailures || 0)
  const reduced = input.reducedCapabilities || []
  if (blocked > 0) return { impact: `${blocked} work item(s) are not progressing.`, affected: true }
  if (failures > 0) return { impact: `${failures} confirmed service failure(s).`, affected: true }
  if (reduced.length) return { impact: `Reduced capability, work still flowing: ${reduced.join(', ')}.`, affected: true }
  return { impact: 'None. No work is blocked and no service failure is confirmed.', affected: false }
}

/**
 * Everything the conclusion rests on, in one block, including what limits it.
 *
 * This exists because the honest complaint about the old page was that an operator could read
 * "Attention required" and have no way to find out what was wrong without opening cards. The
 * answer belongs directly under the headline.
 */
export function buildAssessmentBasis(input: AssessmentInput): BasisLine[] {
  const lines: BasisLine[] = []
  const completed = Number(input.observationsCompleted || 0)
  const expected = Number(input.observationsExpected || 0)
  const missed = Math.max(0, expected - completed)
  const attempted = Number(input.verificationAttempted || 0)
  const failed = Number(input.verificationFailed || 0)

  lines.push({
    label: 'Successful observations',
    value: String(completed),
    polarity: 'supports',
  })
  lines.push({
    label: 'Verification',
    value: attempted > 0 ? `${Math.round(((attempted - failed) / attempted) * 100)}% of ${attempted}` : 'none attempted',
    polarity: attempted > 0 && failed === 0 ? 'supports' : 'limits',
  })
  // Blocked work is always a SUPPORTING fact, whichever way it reads. `limits` marks evidence
  // we do not have, not news we do not like — a measured 3 supports an outage conclusion just
  // as firmly as a measured 0 supports an operational one.
  lines.push({
    label: 'Blocked work',
    value: String(Number(input.blockedWork || 0)),
    polarity: 'supports',
  })
  lines.push({
    label: 'Active queue items',
    value: String(Number(input.queueDepth || 0)),
    polarity: 'supports',
  })
  if (missed > 0) {
    lines.push({
      label: 'Missed scheduled observations',
      value: String(missed),
      polarity: 'limits',
    })
  }
  const unverifiable = input.unverifiableLiveness || []
  if (unverifiable.length) {
    lines.push({ label: 'Runtimes we cannot judge', value: unverifiable.join(', '), polarity: 'limits' })
  }
  const unmeasured = input.unmeasuredDomains || []
  if (unmeasured.length) {
    lines.push({ label: 'Unmeasured domains', value: unmeasured.join(', '), polarity: 'limits' })
  }
  const gaps = Number(input.auditGaps || 0)
  if (gaps > 0) {
    lines.push({ label: 'Runs with no durable record', value: String(gaps), polarity: 'limits' })
  }
  return lines
}

/**
 * The whole assessment: what is happening, whether it affects anyone, what it rests on, how
 * sure we are, and what the operator does.
 *
 * PAGING IS DECIDED BY STATE ALONE. Low confidence never wakes anyone — being unsure at 3am
 * is not an emergency, and a system that pages on its own blind spots teaches people to
 * silence it. Neither does a forecast: something that has not happened has not happened.
 */
export function buildOperationalAssessment(input: AssessmentInput): OperationalAssessment {
  const { state, reason } = assessOperationalState(input)
  const { confidence, reasons } = assessObservationConfidence(input)
  const { impact, affected } = assessImpact(input)
  const assessmentBasis = buildAssessmentBasis(input)

  const pageOnCall = state === 'outage'
  const operatorAction =
    state === 'outage'
      ? 'Free the blocked work, or approve failover. This is the one state that justifies waking someone.'
      : state === 'service_degraded'
        ? 'Restore the reduced capability during working hours. Work is still flowing.'
        : 'None. Continue monitoring.'

  const verifiedBy: EvidenceLine[] = assessmentBasis
    .filter(line => line.polarity === 'supports')
    .map(line => ({ label: line.label, value: line.value }))

  const confidenceStatement =
    confidence >= 100
      ? 'Full confidence — every expected observation was taken and every domain is measured.'
      : reasons.length === 1
        ? `Reduced by one condition: ${reasons[0].label.toLowerCase()}.`
        : `Reduced by ${reasons.length} conditions, listed below. None of them is a statement about the platform.`

  const limits = assessmentBasis.filter(line => line.polarity === 'limits').length
  const basisStatement = limits === 0
    ? 'This assessment is based on the following verified facts.'
    : `This assessment is based on the following facts. ${limits} of them limit what can be concluded and are marked.`

  const forecasts = Number(input.riskForecastCount || 0)
  const whyAmISeeingThis =
    state === 'outage'
      ? 'Work is blocked and that was confirmed by check, so this page is showing an outage and has paged on-call.'
      : state === 'service_degraded'
        ? 'A capability is confirmed reduced while work continues to flow, so this page is showing degradation without paging anyone.'
        : forecasts > 0
          ? `Every impact check passed, so the state is Operational. ${forecasts} risk condition(s) are listed separately below — they describe what may happen, not what is happening.`
          : 'Every impact check passed and nothing is forecast, so there is nothing here for an operator to act on.'

  return {
    state,
    stateLabel: OPERATIONAL_STATE_LABELS[state],
    stateMeaning: OPERATIONAL_STATE_MEANINGS[state],
    stateReason: reason,
    stateVerified: (input.unverifiableLiveness || []).length === 0,
    impact,
    impactAffected: affected,
    assessmentBasis,
    basisStatement,
    confidence,
    confidenceReasons: reasons,
    confidenceStatement,
    verifiedBy,
    operatorAction,
    pageOnCall,
    whyAmISeeingThis,
  }
}

/** "Operational · 93% confidence" — the one line a collapsed card should show. */
export function assessmentHeadline(assessment: OperationalAssessment): string {
  return `${assessment.stateLabel} · ${assessment.confidence}% confidence`
}
