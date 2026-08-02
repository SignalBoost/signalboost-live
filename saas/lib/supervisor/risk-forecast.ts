// saas/lib/supervisor/risk-forecast.ts
//
// A FORECAST IS NOT A STATE.
//
// "The runtime has missed its expected schedule, so new work would not be picked up" was
// being printed as though it described the platform right now. It does not. It is a
// conditional statement about the future — if nothing changes before the next window, then
// work that arrives may not be collected. Printing a prediction in the state line is how a
// console ends up saying "attention required" beside "nothing is blocked" and losing the
// operator's trust in both lines.
//
// So risk gets its own axis. The console now answers four separate questions, and never lets
// one answer contaminate another:
//
//   CURRENT STATE       What is true now, from verified impact.   (operational-assessment)
//   CURRENT IMPACT      Is the business affected now.             (operational-assessment)
//   EVIDENCE            What the conclusion rests on.             (operational-assessment)
//   RISK FORECAST       What may become true, and under what.     (this file)
//
// THREE RULES, ALL OF THEM ENFORCED HERE RATHER THAN TRUSTED TO THE CALLER.
//
//   1. A FORECAST NEVER CHANGES THE OPERATIONAL STATE AND NEVER PAGES. It is read during
//      working hours by someone deciding what to watch. Waking a person for something that
//      has not happened is how alarms get silenced.
//
//   2. EVERY FORECAST STARTS FROM AN OBSERVED FACT. `observed` is present tense and verified;
//      `consequence` is future tense and conditional; `trigger` names what would ALSO have to
//      happen. A forecast with no observed fact behind it is speculation and is not emitted.
//
//   3. EVERY FORECAST NAMES WHAT WOULD CLEAR IT. A prediction nobody can discharge stays on
//      the screen forever and becomes wallpaper.
//
// Likelihood is stated as a word, not a percentage. We do not have the sample size for a
// number, and a fabricated percentage next to a real one is worse than no number at all.
//
// PURE, NO IMPORTS.

export type ForecastLikelihood = 'low' | 'medium' | 'high'

export const LIKELIHOOD_LABELS: Record<ForecastLikelihood, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

export type RiskForecast = {
  code: string
  /** The verified fact this rests on. Present tense. Never a prediction. */
  observed: string
  /** What would ALSO have to happen for the consequence to follow. */
  trigger: string
  /** Future tense, conditional. Never printed without its trigger. */
  consequence: string
  /** When it would become true, in the operator's terms. */
  horizon: string
  likelihood: ForecastLikelihood
  /** The observation or action that discharges this forecast. */
  clearsWhen: string
  /** The raw figures the forecast was computed from, so it can be checked. */
  basis: string[]
}

export type ForecastSet = {
  forecasts: RiskForecast[]
  /** The one line a collapsed card shows. */
  headline: string
  /** Stated on the card so nobody reads a forecast as an incident. */
  disclaimer: string
  any: boolean
  /** The strongest likelihood present, or null when there is nothing to forecast. */
  highest: ForecastLikelihood | null
}

export type ForecastInput = {
  // ── Observation cadence ────────────────────────────────────────────────────
  /** Owed observation windows that did not run. Verified, not inferred from silence. */
  missedObservationWindows?: number
  /** The declared cadence, used to state the horizon in real time rather than "soon". */
  observationIntervalSeconds?: number | null

  // ── Work ───────────────────────────────────────────────────────────────────
  queueDepth?: number
  /** Live work with no owning lease. If this is above zero it is an outage, not a forecast. */
  blockedWork?: number

  // ── Coordination ───────────────────────────────────────────────────────────
  /** Expired leases that still hold work items. */
  expiredLeasesWithWork?: number
  /** Finished records awaiting reconciliation. Housekeeping, not an outage. */
  reconciliationBacklog?: number

  // ── Credentials and connectivity ───────────────────────────────────────────
  /** Provider registrations that failed their integrity check. */
  invalidProviderRegistrations?: number
  /** Runtimes whose liveness could not be established at all. */
  unverifiableRuntimes?: string[]
}

const MINUTES = (seconds: number): string => {
  const minutes = Math.round(seconds / 60)
  if (minutes <= 0) return 'less than a minute'
  if (minutes === 1) return '1 minute'
  if (minutes < 90) return `${minutes} minutes`
  return `${Math.round(minutes / 60)} hours`
}

const RANK: Record<ForecastLikelihood, number> = { high: 0, medium: 1, low: 2 }

/**
 * Turn observed conditions into conditional statements about the future.
 *
 * Nothing here reports on the present. A condition that is ALREADY causing impact — blocked
 * work above zero — is deliberately not forecast: it has happened, it belongs to the state,
 * and repeating it here as "may happen" would understate a live outage.
 */
export function buildRiskForecast(input: ForecastInput): ForecastSet {
  const forecasts: RiskForecast[] = []
  const blocked = Number(input.blockedWork || 0)
  const queue = Number(input.queueDepth || 0)

  // ── Missed observation windows ─────────────────────────────────────────────
  // The one his screen kept mislabelling. A missed window has NOT stopped anything. It means
  // that IF the next window is also missed, arriving work would sit uncollected.
  const missed = Number(input.missedObservationWindows || 0)
  if (missed > 0) {
    const interval = Number(input.observationIntervalSeconds || 0)
    forecasts.push({
      code: 'observation_cadence',
      observed: missed === 1
        ? 'One owed observation window passed without a run.'
        : `${missed} owed observation windows passed without a run.`,
      trigger: 'If the next scheduled observation also does not run',
      consequence: 'new work arriving would not be collected until an observation completes.',
      horizon: interval > 0 ? `Next window in about ${MINUTES(interval)}.` : 'At the next scheduled window.',
      // One miss is a scheduler hiccup and usually self-corrects. Two is a pattern.
      likelihood: missed >= 2 ? 'high' : 'medium',
      clearsWhen: 'The next observation completes. No operator action is required before then.',
      basis: [
        `${missed} missed window(s)`,
        interval > 0 ? `declared cadence ${interval}s` : 'cadence not declared',
        `${queue} item(s) waiting`,
      ],
    })
  }

  // ── Expired leases still holding work ──────────────────────────────────────
  // Not yet blocked: the work has an owner on paper. It becomes blocked when reconciliation
  // does not reclaim it.
  const expired = Number(input.expiredLeasesWithWork || 0)
  if (expired > 0 && blocked === 0) {
    forecasts.push({
      code: 'lease_reclaim',
      observed: `${expired} expired lease(s) still hold work items.`,
      trigger: 'If reconciliation does not reclaim them',
      consequence: 'that work would become unowned and stop progressing.',
      horizon: 'At the next reconciliation pass.',
      likelihood: expired > 5 ? 'high' : 'medium',
      clearsWhen: 'Reconciliation reclaims the leases, or they are released manually.',
      basis: [`${expired} expired lease(s) with work`, `${blocked} blocked item(s) now`],
    })
  }

  // ── Runtimes we cannot judge ───────────────────────────────────────────────
  // This is deliberately a forecast and not a state: not knowing is not the same as failing,
  // and the console must not report either one as the other.
  const unverifiable = input.unverifiableRuntimes || []
  if (unverifiable.length > 0) {
    forecasts.push({
      code: 'unverifiable_runtime',
      observed: `Liveness cannot be established for ${unverifiable.join(', ')}.`,
      trigger: 'If one of these runtimes has in fact stopped',
      consequence: 'the failure would not be detected by this console.',
      horizon: 'Already possible. There is no window that reveals it.',
      likelihood: queue > 0 ? 'high' : 'medium',
      clearsWhen: 'Supply the evidence its trigger model requires — a poll time, a reachability probe, a heartbeat.',
      basis: [`${unverifiable.length} runtime(s) unverifiable`, `${queue} item(s) waiting`],
    })
  }

  // ── Provider registration integrity ────────────────────────────────────────
  const invalid = Number(input.invalidProviderRegistrations || 0)
  if (invalid > 0) {
    forecasts.push({
      code: 'provider_registration',
      observed: `${invalid} provider registration(s) failed their integrity check.`,
      trigger: 'If work is routed to one of them',
      consequence: 'that work would be refused rather than executed.',
      horizon: 'On the next dispatch to an affected provider.',
      likelihood: 'medium',
      clearsWhen: 'The registration passes its integrity check again.',
      basis: [`${invalid} invalid registration(s)`],
    })
  }

  // ── Reconciliation backlog ─────────────────────────────────────────────────
  // Finished records. Genuinely low: it costs a maintenance window, never service.
  const backlog = Number(input.reconciliationBacklog || 0)
  if (backlog >= 100) {
    forecasts.push({
      code: 'reconciliation_backlog',
      observed: `${backlog} finished record(s) are awaiting reconciliation.`,
      trigger: 'If the backlog keeps growing',
      consequence: 'reconciliation will eventually need a maintenance window rather than running inline.',
      horizon: 'Days, not hours.',
      likelihood: 'low',
      clearsWhen: 'A reconciliation pass clears the finished records.',
      basis: [`${backlog} finished record(s)`, 'no work is stranded by these'],
    })
  }

  forecasts.sort((a, b) => RANK[a.likelihood] - RANK[b.likelihood])
  const highest = forecasts.length ? forecasts[0].likelihood : null

  return {
    forecasts,
    headline: forecasts.length === 0
      ? 'No risk conditions identified.'
      : forecasts.length === 1
        ? `1 risk condition · ${LIKELIHOOD_LABELS[highest as ForecastLikelihood].toLowerCase()} likelihood`
        : `${forecasts.length} risk conditions · highest ${LIKELIHOOD_LABELS[highest as ForecastLikelihood].toLowerCase()}`,
    disclaimer: forecasts.length === 0
      ? 'Nothing observed suggests a future problem.'
      : 'These are conditional statements about what may happen. None of them is happening now, and none of them pages anyone.',
    any: forecasts.length > 0,
    highest,
  }
}

/** "If the next scheduled observation also does not run, new work … " — one readable line. */
export function forecastSentence(forecast: RiskForecast): string {
  return `${forecast.trigger}, ${forecast.consequence}`
}
