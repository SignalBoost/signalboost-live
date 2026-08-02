// saas/lib/supervisor/health-domains.ts
//
// EIGHT INDEPENDENT DOMAINS, EACH MEASURED ONCE.
//
// The previous score averaged nine "components" that were not independent. Supervisor health
// appeared twice, as availability and again on its own, so one idle runtime cost seven
// points for a single fact. Verification, audit, scheduler and webhook success each appeared
// twice more — once alone and once inside a composite called reliability. Averaging
// overlapping metrics does not produce a weighted opinion; it produces an arbitrary one, and
// nobody can say what the weights are.
//
// So the model is rebuilt around domains that do not overlap. Each fact contributes to
// exactly one. Ask "which domain does this evidence belong to" and there is one answer.
//
// THE RULE THAT MATTERS MOST HERE: A DOMAIN WITH NO INDEPENDENT SIGNAL IS NOT SCORED. It is
// reported as not measured and excluded from the average, rather than borrowing a number
// from a neighbour. Persistence used to be "inferred from audit completeness", which is not
// a measurement of persistence — it is audit's number wearing a different label, and it is
// exactly how the double-counting got in. An honest 6-of-8 beats a complete-looking 8-of-8
// built from four real readings.
//
// A SCORE OF null MEANS UNKNOWN, NOT HEALTHY. If nothing is measured there is no score, and
// the console must say so rather than showing 100.
//
// PURE, NO IMPORTS.

export type DomainId =
  | 'execution'
  | 'observation'
  | 'verification'
  | 'audit'
  | 'persistence'
  | 'coordination'
  | 'provider_connectivity'
  | 'business_impact'

export type DomainAssessment = {
  id: DomainId
  label: string
  /** False when no independent signal exists. Such a domain is excluded from the score. */
  measured: boolean
  /** 0–100, or null when unmeasured. */
  score: number | null
  question: string
  evidence: string[]
  /** Present only when points were lost, and stated in operational terms. */
  finding: string | null
}

export type DomainSnapshot = {
  domains: DomainAssessment[]
  /** Average of MEASURED domains. Null when nothing could be measured. */
  score: number | null
  measured: number
  unmeasured: DomainId[]
  /** Stated so a reader knows how much of the picture the score represents. */
  coverage: string
}

export type DomainInput = {
  /** Runs dispatched and how many failed outright. */
  execution?: { dispatched: number; failed: number } | null
  /** Whether observations happened on their declared cadence. */
  observation?: { expected: number; completed: number } | null
  verification?: { attempted: number; failed: number } | null
  audit?: { runs: number; withoutTerminalEvent: number } | null
  /** Durable-write outcomes. Null when nothing independently measures this. */
  persistence?: { attempted: number; failed: number } | null
  coordination?: {
    absentInstances: number
    activeInstances: number
    expiredLeasesWithWork: number
    staleWork: number
  } | null
  providerConnectivity?: {
    registered: number
    invalid: number
    deliveriesAttempted?: number | null
    deliveriesFailed?: number | null
  } | null
  /** The only domain that answers "is the business affected". */
  businessImpact?: { blockedWork: number; queueDepth: number } | null
}

const ratio = (good: number, total: number): number => (total <= 0 ? 100 : Math.round((good / total) * 100))

function unmeasured(id: DomainId, label: string, question: string, why: string): DomainAssessment {
  return { id, label, measured: false, score: null, question, evidence: [why], finding: null }
}

/**
 * Score each domain from its own evidence.
 *
 * Every branch answers one question, and no fact is used by two domains. Where a caller
 * passes null, the domain is honestly reported as unmeasured rather than filled in.
 */
export function assessHealthDomains(input: DomainInput): DomainSnapshot {
  const domains: DomainAssessment[] = []

  // ── Execution ──────────────────────────────────────────────────────────────
  if (input.execution) {
    const { dispatched, failed } = input.execution
    const score = ratio(dispatched - failed, dispatched)
    domains.push({
      id: 'execution', label: 'Execution', measured: true, score,
      question: 'Did the work that was dispatched actually run?',
      evidence: [`${dispatched} dispatched, ${failed} failed.`],
      finding: failed ? `${failed} dispatched run(s) failed to execute.` : null,
    })
  } else {
    domains.push(unmeasured('execution', 'Execution', 'Did the work that was dispatched actually run?', 'No dispatch outcomes were supplied.'))
  }

  // ── Observation ────────────────────────────────────────────────────────────
  // Measured against the CADENCE the policy declares, not against elapsed time — the
  // question is whether the runs that were owed happened.
  if (input.observation && input.observation.expected > 0) {
    const { expected, completed } = input.observation
    const score = ratio(Math.min(completed, expected), expected)
    domains.push({
      id: 'observation', label: 'Observation', measured: true, score,
      question: 'Did the observations owed by policy actually happen?',
      evidence: [`${completed} of ${expected} expected observation(s) completed in the window.`],
      finding: completed < expected ? `${expected - completed} owed observation(s) did not happen.` : null,
    })
  } else {
    domains.push(unmeasured('observation', 'Observation', 'Did the observations owed by policy actually happen?', 'No declared cadence to measure against, so completeness cannot be judged.'))
  }

  // ── Verification ───────────────────────────────────────────────────────────
  if (input.verification && input.verification.attempted > 0) {
    const { attempted, failed } = input.verification
    const score = ratio(attempted - failed, attempted)
    domains.push({
      id: 'verification', label: 'Verification', measured: true, score,
      question: 'Was each outcome independently confirmed?',
      evidence: [`${attempted} verification(s), ${failed} failed.`],
      finding: failed ? `${failed} outcome(s) could not be confirmed.` : null,
    })
  } else {
    domains.push(unmeasured('verification', 'Verification', 'Was each outcome independently confirmed?', 'No verifications were attempted in this window.'))
  }

  // ── Audit ──────────────────────────────────────────────────────────────────
  if (input.audit && input.audit.runs > 0) {
    const { runs, withoutTerminalEvent } = input.audit
    const score = ratio(runs - withoutTerminalEvent, runs)
    domains.push({
      id: 'audit', label: 'Audit evidence', measured: true, score,
      question: 'Was every outcome durably recorded?',
      evidence: [`${runs} run(s), ${withoutTerminalEvent} with no terminal audit event.`],
      finding: withoutTerminalEvent ? `${withoutTerminalEvent} run(s) have no durable record of how they ended.` : null,
    })
  } else {
    domains.push(unmeasured('audit', 'Audit evidence', 'Was every outcome durably recorded?', 'No runs in this window to audit.'))
  }

  // ── Persistence ────────────────────────────────────────────────────────────
  // Deliberately unmeasured unless a caller supplies real write outcomes. Inferring it from
  // audit completeness is what produced the double counting: that is audit's number under a
  // second name, and a domain that borrows evidence is not an independent domain.
  if (input.persistence && input.persistence.attempted > 0) {
    const { attempted, failed } = input.persistence
    const score = ratio(attempted - failed, attempted)
    domains.push({
      id: 'persistence', label: 'Persistence', measured: true, score,
      question: 'Did durable writes succeed?',
      evidence: [`${attempted} write(s), ${failed} failed.`],
      finding: failed ? `${failed} durable write(s) failed.` : null,
    })
  } else {
    domains.push(unmeasured('persistence', 'Persistence', 'Did durable writes succeed?', 'No independent write outcomes are collected yet. Not inferred from audit — that would be the same measurement counted twice.'))
  }

  // ── Coordination ───────────────────────────────────────────────────────────
  if (input.coordination) {
    const { absentInstances, activeInstances, expiredLeasesWithWork, staleWork } = input.coordination
    const faults = absentInstances + expiredLeasesWithWork + staleWork
    const population = Math.max(1, activeInstances + expiredLeasesWithWork + staleWork)
    const score = Math.max(0, ratio(population - faults, population))
    const parts: string[] = []
    if (absentInstances) parts.push(`${absentInstances} absent instance(s)`)
    if (expiredLeasesWithWork) parts.push(`${expiredLeasesWithWork} expired lease(s) still holding work`)
    if (staleWork) parts.push(`${staleWork} stale work item(s)`)
    domains.push({
      id: 'coordination', label: 'Coordination', measured: true, score,
      question: 'Is work being claimed, held and released correctly?',
      evidence: [`${activeInstances} active instance(s).${parts.length ? ` ${parts.join(', ')}.` : ' No coordination faults.'}`],
      finding: parts.length ? parts.join(', ') : null,
    })
  } else {
    domains.push(unmeasured('coordination', 'Coordination', 'Is work being claimed, held and released correctly?', 'No coordination facts were supplied.'))
  }

  // ── Provider connectivity ──────────────────────────────────────────────────
  // Registration integrity and inbound delivery are one domain: both answer whether we can
  // actually reach and be reached by the provider.
  if (input.providerConnectivity) {
    const { registered, invalid, deliveriesAttempted, deliveriesFailed } = input.providerConnectivity
    const registrationScore = ratio(Math.max(0, registered - invalid), Math.max(1, registered))
    const hasDeliveries = Number(deliveriesAttempted || 0) > 0
    const deliveryScore = hasDeliveries
      ? ratio(Number(deliveriesAttempted) - Number(deliveriesFailed || 0), Number(deliveriesAttempted))
      : null
    const score = deliveryScore === null ? registrationScore : Math.round((registrationScore + deliveryScore) / 2)
    const evidence = [`${registered} registered provider(s), ${invalid} invalid.`]
    if (hasDeliveries) evidence.push(`${deliveriesAttempted} inbound delivery attempt(s), ${deliveriesFailed || 0} failed.`)
    domains.push({
      id: 'provider_connectivity', label: 'Provider connectivity', measured: true, score,
      question: 'Can we reach the providers, and can they reach us?',
      evidence,
      finding: invalid || Number(deliveriesFailed || 0) > 0
        ? `${invalid} invalid registration(s), ${deliveriesFailed || 0} failed inbound delivery(ies).`
        : null,
    })
  } else {
    domains.push(unmeasured('provider_connectivity', 'Provider connectivity', 'Can we reach the providers, and can they reach us?', 'No provider facts were supplied.'))
  }

  // ── Business impact ────────────────────────────────────────────────────────
  // The only domain an operator truly needs at 3am, and the one that decides an outage.
  if (input.businessImpact) {
    const { blockedWork, queueDepth } = input.businessImpact
    const score = blockedWork > 0 ? 0 : queueDepth > 100 ? 60 : queueDepth > 25 ? 85 : 100
    domains.push({
      id: 'business_impact', label: 'Business impact', measured: true, score,
      question: 'Is anything actually blocked?',
      evidence: [`${blockedWork} blocked work item(s), queue depth ${queueDepth}.`],
      finding: blockedWork > 0
        ? `${blockedWork} work item(s) are blocked with no owner.`
        : queueDepth > 25 ? `Queue depth is ${queueDepth} and growing.` : null,
    })
  } else {
    domains.push(unmeasured('business_impact', 'Business impact', 'Is anything actually blocked?', 'No work or queue facts were supplied.'))
  }

  const measured = domains.filter(domain => domain.measured)
  const score = measured.length
    ? Math.round(measured.reduce((total, domain) => total + Number(domain.score), 0) / measured.length)
    : null

  return {
    domains,
    score,
    measured: measured.length,
    unmeasured: domains.filter(domain => !domain.measured).map(domain => domain.id),
    coverage: `${measured.length} of ${domains.length} domains measured`,
  }
}
