// saas/lib/supervisor/diagnostic-status.ts
//
// DIAGNOSTICS DO NOT GET TO SAY "CRITICAL".
//
// The operations console was running two independent status vocabularies and printing them
// with the same words. The verified assessment at the top said "Operational — no impact". The
// subsystem cards below said "Lease health: critical". Both were correct about their own
// question and the page read as a contradiction, which is worse than either being wrong: an
// operator who sees "100% healthy" above "three subsystems critical" stops believing the page
// rather than working out which line applies to them.
//
// The two questions are:
//
//   OPERATIONAL   Is service continuity threatened? Is work blocked? Should someone be woken?
//                 Answered by health-severity.ts, against verified impact. It may say critical.
//
//   DIAGNOSTIC    Did an internal measurement cross a threshold? Is there housekeeping owed?
//                 Answered here. It may NEVER say critical, incident or outage — those words
//                 are reserved for something that threatens service, and a vocabulary that
//                 borrows them spends the operator's alarm on a cleanup queue.
//
// THE CASE THAT MADE THIS OBVIOUS: a hundred expired leases scored 45% and were labelled
// critical. Every one of them had finished its work and was waiting to be reconciled. That is
// cleanup pending. The same hundred leases with work still attached would be an operational
// matter — and the discriminator is not the count, it is whether anything is stranded.
//
// PURE, NO IMPORTS.

export type DiagnosticStatus =
  | 'nominal'             // within its normal range
  | 'expected_transient'  // outside the range, and that is normal for this design
  | 'observation_delayed' // an owed observation has not happened; says what occurred, not that
                          // the runtime is unwell — an active instance that missed a window is
                          // late, and calling it "70% healthy" describes nothing an operator
                          // can act on
  | 'cleanup_pending'     // housekeeping owed; nothing is waiting on it
  | 'maintenance_required' // needs a person, during business hours
  | 'capability_reduced'  // something works less well or not at all, without blocking work

export type OperationalImpact = 'none' | 'possible' | 'confirmed'

export type DiagnosticAssessment = {
  subsystemId: string
  status: DiagnosticStatus
  label: string
  score: number
  /** What this measurement means in plain terms. */
  explanation: string
  /** Always stated, so the card can never be read as an outage by accident. */
  operationalImpact: OperationalImpact
  impactStatement: string
  /** Empty when nothing is owed. */
  recommendation: string
}

export const DIAGNOSTIC_LABELS: Record<DiagnosticStatus, string> = {
  nominal: 'Nominal',
  expected_transient: 'Expected transient',
  observation_delayed: 'Observation schedule delayed',
  cleanup_pending: 'Cleanup pending',
  maintenance_required: 'Maintenance required',
  capability_reduced: 'Capability reduced',
}

export type DiagnosticContext = {
  /** Live work with no owner. The single fact that turns housekeeping into an operation. */
  blockedWork?: number
  /** True when the runtime is legitimately idle between scheduled executions. */
  runtimeIdleByDesign?: boolean
  /** True when an owed observation window passed without a run. */
  observationWindowMissed?: boolean
}

type Rule = {
  /** What this subsystem is really measuring, in words an operator would use. */
  explain: (metric: number | null, context: DiagnosticContext) => string
  classify: (score: number, metric: number | null, context: DiagnosticContext) => DiagnosticStatus
  impact: (status: DiagnosticStatus, context: DiagnosticContext) => OperationalImpact
  recommend: (status: DiagnosticStatus, metric: number | null) => string
}

const count = (metric: number | null): number => (metric === null || metric === undefined ? 0 : Number(metric))

/**
 * Housekeeping rules: a backlog of finished things is cleanup, and only becomes operational
 * when something live is waiting on it.
 */
const houseKeeping = (noun: string): Rule => ({
  explain: metric => `${count(metric)} ${noun} awaiting reconciliation.`,
  classify: (score, metric, context) => {
    if (Number(context.blockedWork || 0) > 0) return 'maintenance_required'
    if (count(metric) === 0) return 'nominal'
    return 'cleanup_pending'
  },
  impact: (status, context) => (Number(context.blockedWork || 0) > 0 ? 'possible' : 'none'),
  recommend: (status, metric) =>
    status === 'cleanup_pending'
      ? `Reconcile ${count(metric)} finished record(s) when convenient. Nothing is waiting on them.`
      : status === 'maintenance_required'
        ? 'Reconcile now — live work is waiting to be reclaimed.'
        : '',
})

const RULES: Record<string, Rule> = {
  lease: houseKeeping('completed lease(s)'),
  expired_leases: houseKeeping('expired lease(s)'),
  reconciliation_backlog: houseKeeping('lease(s) needing reconciliation'),
  stale_work: {
    explain: metric => `${count(metric)} work item(s) have not moved in over an hour.`,
    classify: (score, metric) => (count(metric) === 0 ? 'nominal' : 'maintenance_required'),
    impact: () => 'possible',
    recommend: (status, metric) => (status === 'nominal' ? '' : `Check why ${count(metric)} item(s) have stalled.`),
  },
  supervisor: {
    explain: (metric, context) => context.observationWindowMissed
      ? `${count(metric)} active supervisor instance(s); an owed observation window passed without a run.`
      : context.runtimeIdleByDesign
        ? 'The runtime is idle between scheduled executions.'
        : `${count(metric)} active supervisor instance(s).`,
    classify: (score, metric, context) => {
      // An instance that is present but late is DELAYED, not unhealthy. The old label said
      // "supervisor: warning 70%" beside evidence reading "1 active instance", which asked
      // the operator to reconcile two lines that never disagreed.
      if (context.observationWindowMissed && count(metric) > 0) return 'observation_delayed'
      if (context.runtimeIdleByDesign) return 'expected_transient'
      return score >= 90 ? 'nominal' : count(metric) === 0 ? 'maintenance_required' : 'capability_reduced'
    },
    impact: status => (status === 'maintenance_required' ? 'possible' : 'none'),
    recommend: status => (status === 'maintenance_required' ? 'Start a supervisor instance — nothing will be picked up without one.' : ''),
  },
  observation_schedule: {
    explain: (metric, context) => context.observationWindowMissed
      ? 'An owed observation window passed without a run.'
      : 'Observations are arriving on their declared cadence.',
    classify: (score, metric, context) => (context.observationWindowMissed ? 'observation_delayed' : 'nominal'),
    impact: () => 'none',
    recommend: status => (status === 'nominal' ? '' : 'Wait for the next window before escalating. If it is missed too, the schedule itself has stopped.'),
  },
  missed_heartbeats: {
    explain: (metric, context) => context.runtimeIdleByDesign
      ? 'Heartbeat ages between scheduled runs, which is expected for this execution model.'
      : `${count(metric)} instance(s) have a stale heartbeat.`,
    classify: (score, metric, context) => {
      if (context.observationWindowMissed && count(metric) > 0) return 'observation_delayed'
      if (context.runtimeIdleByDesign) return 'expected_transient'
      return count(metric) === 0 ? 'nominal' : 'maintenance_required'
    },
    impact: status => (status === 'maintenance_required' ? 'possible' : 'none'),
    recommend: status => (status === 'maintenance_required' ? 'Confirm the runtime is alive and writing heartbeats.' : ''),
  },
  bpal_registry: {
    explain: metric => `${count(metric)} browser provider registration(s).`,
    classify: score => (score >= 90 ? 'nominal' : 'capability_reduced'),
    impact: () => 'none',
    recommend: status => (status === 'nominal' ? '' : 'Correct the registration. Execution against it stays refused until it validates, which is the safe behaviour.'),
  },
  provider_registration: {
    explain: metric => `${count(metric)} provider registration(s) checked.`,
    classify: score => (score >= 90 ? 'nominal' : 'capability_reduced'),
    impact: () => 'none',
    recommend: status => (status === 'nominal' ? '' : 'Correct the registration before relying on that provider.'),
  },
  audit_failures: {
    explain: metric => `${count(metric)} run(s) with no terminal audit event.`,
    classify: (score, metric) => (count(metric) === 0 ? 'nominal' : 'maintenance_required'),
    impact: () => 'none',
    recommend: status => (status === 'nominal' ? '' : 'Investigate audit persistence before the next compliance review. This is an evidence gap, not an outage.'),
  },
  queue_depth: {
    explain: metric => `${count(metric)} active work item(s) queued.`,
    classify: (score, metric) => (count(metric) > 100 ? 'maintenance_required' : count(metric) > 25 ? 'capability_reduced' : 'nominal'),
    impact: () => 'none',
    recommend: (status, metric) => (status === 'nominal' ? '' : `Queue depth is ${count(metric)}. Watch the trend — a queue that only grows is a capacity problem.`),
  },
}

const DEFAULT_RULE: Rule = {
  explain: metric => (metric === null || metric === undefined ? 'No metric reported.' : `Metric: ${metric}.`),
  classify: score => (score >= 90 ? 'nominal' : score >= 70 ? 'capability_reduced' : 'maintenance_required'),
  impact: () => 'none',
  recommend: status => (status === 'nominal' ? '' : 'Review during business hours.'),
}

const IMPACT_STATEMENT: Record<OperationalImpact, string> = {
  none: 'No operational impact.',
  possible: 'Could affect operations if left unattended.',
  confirmed: 'Operations are affected — see the assessment above.',
}

/**
 * Classify one subsystem measurement in diagnostic terms.
 *
 * The returned status can never be read as an outage: the vocabulary has no word for one,
 * and the impact statement is always present.
 */
export function assessDiagnostic(
  subsystemId: string,
  score: number,
  metric: number | null,
  context: DiagnosticContext = {},
): DiagnosticAssessment {
  const rule = RULES[subsystemId] || DEFAULT_RULE
  const status = rule.classify(score, metric, context)
  const operationalImpact = rule.impact(status, context)
  return {
    subsystemId,
    status,
    label: DIAGNOSTIC_LABELS[status],
    score,
    explanation: rule.explain(metric, context),
    operationalImpact,
    impactStatement: IMPACT_STATEMENT[operationalImpact],
    recommendation: rule.recommend(status, metric),
  }
}

export type DiagnosticSummary = {
  total: number
  nominal: number
  /** "18/18 nominal" — the one line a collapsed diagnostics section should show. */
  headline: string
  /** Anything not nominal, worst first, for the expanded view. */
  attention: DiagnosticAssessment[]
  /** True when nothing here needs a person at all. */
  quiet: boolean
}

const ORDER: Record<DiagnosticStatus, number> = {
  maintenance_required: 0,
  capability_reduced: 1,
  observation_delayed: 2,
  cleanup_pending: 3,
  expected_transient: 4,
  nominal: 5,
}

export function summariseDiagnostics(assessments: DiagnosticAssessment[]): DiagnosticSummary {
  const nominal = assessments.filter(item => item.status === 'nominal').length
  const attention = assessments
    .filter(item => item.status !== 'nominal')
    .sort((a, b) => ORDER[a.status] - ORDER[b.status])
  return {
    total: assessments.length,
    nominal,
    headline: `${nominal}/${assessments.length} nominal`,
    attention,
    // Cleanup and expected transients do not need anyone. Only the first two statuses do.
    quiet: !assessments.some(item => item.status === 'maintenance_required' || item.status === 'capability_reduced'),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Incidents: what is happening now versus what has been recorded
// ─────────────────────────────────────────────────────────────────────────────
//
// "Critical · 12" beside "Operational — no impact" is the same contradiction in a second
// place. Twelve verified, fully audited deployment failures are EVIDENCE THAT THE SUPERVISOR
// WORKED — it observed them, verified them and recorded them. They are not twelve live
// outages, and displaying them under one unqualified heading invites exactly that reading.

export type IncidentRecord = {
  runId: string
  severity: string
  status: string
  completedAt?: string | null
  resolved?: boolean
}

export type IncidentSplit = {
  active: IncidentRecord[]
  historical: IncidentRecord[]
  activeLabel: string
  historicalLabel: string
}

const RESOLVED_STATES = new Set(['verified', 'remediated', 'resolved', 'closed', 'completed'])

/**
 * Separate live incidents from recorded ones.
 *
 * An incident whose run reached a terminal verified state is history: it was seen, confirmed
 * and written down. Anything still open, or unverified, is active until proven otherwise —
 * unknown counts as active, because the failure of assuming otherwise is an outage nobody
 * looked at.
 */
export function splitIncidents(records: IncidentRecord[]): IncidentSplit {
  const active: IncidentRecord[] = []
  const historical: IncidentRecord[] = []
  for (const record of records || []) {
    const settled = record.resolved === true || RESOLVED_STATES.has(String(record.status || '').toLowerCase())
    if (settled) historical.push(record)
    else active.push(record)
  }
  return {
    active,
    historical,
    activeLabel: `Operational incidents · ${active.length}`,
    historicalLabel: `Recorded and verified · ${historical.length}`,
  }
}
