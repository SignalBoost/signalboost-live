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
// EVERY CONCLUSION MUST BE CHALLENGEABLE. Adopted as a standing rule for this product: an
// operator must be able to take any statement the Supervisor makes and see four things — the
// EVIDENCE it used, the REASONING it applied, the RULE that produced it, and the CONDITIONS
// under which it would change. A conclusion that cannot answer those four is an opinion with
// a stylesheet. Every assessment returned here carries all four.
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
  | 'not_measured'        // no metric was reported at all. NOT a synonym for fine: the old
                          // default rule scored a missing measurement as "capability reduced,
                          // no metric reported", which invented a judgement out of an absence.
                          // An unmeasured subsystem is not evidence of health

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

  // ── The four questions every conclusion must answer ────────────────────────
  /** EVIDENCE: the measurements this classification actually saw. */
  evidence: string[]
  /** RULE: which named rule produced it, so two subsystems cannot be judged by one number. */
  rule: string
  /** The rule under a name an operator recognises, rather than a table key. */
  ruleName: string
  /** What the rule is FOR. An identifier tells you which code ran; a purpose tells you why. */
  rulePurpose: string
  /** Why this rule is allowed to be this relaxed — the safety argument behind the threshold. */
  ruleSafetyRationale: string
  /** REASONING: why this status and not the neighbouring one. */
  reasoning: string
  /** CONDITIONS: what would move it to a different status. */
  changesWhen: string
  /** The same conclusion as an ordered, machine-readable chain, for audit export. */
  inferenceChain: InferenceStep[]
}

/**
 * One link in the reasoning, with a STABLE key.
 *
 * The prose fields above are for a person reading the console. This is the same conclusion in
 * a shape an audit tool can walk without parsing English: observation → rule → evidence →
 * conclusion → recommendation, always those five, always in that order, always present even
 * when a step is empty. An auditor asking "show me how you reached this" gets a structure
 * rather than a paragraph.
 */
export type InferenceStepKey = 'observation' | 'rule' | 'evidence' | 'conclusion' | 'recommendation'

export type InferenceStep = {
  step: InferenceStepKey
  statement: string
}

export const DIAGNOSTIC_LABELS: Record<DiagnosticStatus, string> = {
  nominal: 'Nominal',
  expected_transient: 'Expected transient',
  observation_delayed: 'Observation schedule delayed',
  cleanup_pending: 'Cleanup pending',
  maintenance_required: 'Maintenance required',
  capability_reduced: 'Capability reduced',
  not_measured: 'Not measured',
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

// A subsystem with no rule of its own gets thresholds — but NEVER a judgement invented from a
// missing measurement. "Capability reduced · No metric reported" was the console asserting
// degradation on the strength of an absence, which is the same error as scoring an unmeasured
// domain. Absence now reports as absence.
const DEFAULT_RULE: Rule = {
  explain: metric =>
    metric === null || metric === undefined
      ? 'No metric was reported for this subsystem in the current observation period.'
      : `Measured value: ${metric}.`,
  classify: (score, metric) =>
    metric === null || metric === undefined
      ? 'not_measured'
      : score >= 90
        ? 'nominal'
        : score >= 70
          ? 'capability_reduced'
          : 'maintenance_required',
  impact: () => 'none',
  recommend: status =>
    status === 'nominal'
      ? ''
      : status === 'not_measured'
        ? 'Confirm the source reports a metric. An unreported measurement is not evidence of health.'
        : 'Review during business hours.',
}

/**
 * What each rule is for, and why it is allowed to be as relaxed as it is.
 *
 * "Rule applied: lease" tells an operator which code ran and nothing else. The purpose says
 * what the rule is trying to prevent; the safety rationale is the argument for why this
 * particular condition does not need to be treated as urgent. That second field is the one an
 * auditor reads — it is where a threshold stops being a number somebody picked and becomes a
 * position the product is prepared to defend.
 */
export type RuleMeta = {
  name: string
  purpose: string
  safetyRationale: string
}

const RULE_META: Record<string, RuleMeta> = {
  lease: {
    name: 'Lease cleanup policy',
    purpose: 'Prevent accumulation of completed leases.',
    safetyRationale: 'A completed lease holds nothing. It becomes operational only when live work is waiting on it, and that condition is checked separately.',
  },
  expired_leases: {
    name: 'Expired lease reclaim policy',
    purpose: 'Return expired leases to the pool so their work can be reclaimed.',
    safetyRationale: 'Expiry alone strands nothing. The discriminator is whether the work attached to the lease is still live, not how many leases have expired.',
  },
  reconciliation_backlog: {
    name: 'Reconciliation backlog policy',
    purpose: 'Keep the reconciliation queue short enough to run inline rather than in a maintenance window.',
    safetyRationale: 'A backlog of finished records costs time, never continuity. Treating it as urgent spends the operator’s attention on housekeeping.',
  },
  stale_work: {
    name: 'Stalled work policy',
    purpose: 'Detect work that has stopped progressing without failing.',
    safetyRationale: 'A stalled item is not yet a blocked item, but it is the state a blocked item passes through, so it is worth a person during the working day.',
  },
  supervisor: {
    name: 'Supervisor presence policy',
    purpose: 'Confirm at least one runtime is available to pick up work.',
    safetyRationale: 'A serverless runtime is idle between executions by design. Absence of activity is not absence of capability, and only a runtime that is both idle and late is worth reporting.',
  },
  observation_schedule: {
    name: 'Observation cadence policy',
    purpose: 'Confirm observations arrive at the cadence the policy declares.',
    safetyRationale: 'One missed window resolves itself at the next run. Escalating on the first miss trains operators to ignore the second.',
  },
  missed_heartbeats: {
    name: 'Heartbeat freshness policy',
    purpose: 'Detect a runtime that has stopped writing heartbeats while work is expected of it.',
    safetyRationale: 'Heartbeat age is meaningful only against the execution model. For a scheduled runtime, an aging heartbeat between runs is the expected reading.',
  },
  bpal_registry: {
    name: 'Browser provider registration policy',
    purpose: 'Ensure every registered provider passes its integrity check before work is routed to it.',
    safetyRationale: 'A failed registration causes execution to be refused, not attempted incorrectly. The failure mode is safe, which is why this is not urgent.',
  },
  provider_registration: {
    name: 'Provider registration policy',
    purpose: 'Ensure provider registrations are valid before anything depends on them.',
    safetyRationale: 'An invalid registration removes a capability. It does not corrupt work already in flight.',
  },
  audit_failures: {
    name: 'Audit completeness policy',
    purpose: 'Ensure every run leaves a terminal record that can be replayed later.',
    safetyRationale: 'An audit gap costs what can be PROVEN about a window, not what happened in it. It is an evidence problem and belongs to the compliance calendar.',
  },
  queue_depth: {
    name: 'Queue depth policy',
    purpose: 'Detect a queue growing faster than it drains.',
    safetyRationale: 'Depth alone is not a fault — a queue exists to absorb bursts. The signal worth acting on is a depth that only ever rises.',
  },
  default_threshold: {
    name: 'Default threshold policy',
    purpose: 'Classify a subsystem that has no rule of its own, using score thresholds only.',
    safetyRationale: 'A generic threshold cannot know what the measurement means, so it never invents a judgement from a missing metric and never claims operational impact.',
  },
}

// Why this status rather than the one next to it. Derived from the status so that every rule
// answers the question the same way and none of them can quietly skip it.
const REASONING: Record<DiagnosticStatus, string> = {
  nominal: 'The measurement is inside its normal range and nothing is owed.',
  expected_transient: 'The measurement is outside its normal range, and the execution model predicts exactly this. It is not a fault.',
  observation_delayed: 'An owed observation did not run. The runtime is late, which is a different fact from the runtime being unwell.',
  cleanup_pending: 'Housekeeping is owed and nothing live is waiting on it. That is what separates cleanup from maintenance.',
  maintenance_required: 'The condition needs a person, and it does not threaten service continuity while it waits.',
  capability_reduced: 'A measured capability is below threshold while work continues to flow.',
  not_measured: 'No metric arrived, so no judgement is available. This is a gap in evidence, not a finding about the subsystem.',
}

// What would move this to a different status. A conclusion nobody can discharge stays on the
// screen forever and becomes wallpaper.
const CHANGES_WHEN: Record<DiagnosticStatus, string> = {
  nominal: 'Changes if the measurement leaves its normal range.',
  expected_transient: 'Changes if the runtime stays in this state while work is waiting on it.',
  observation_delayed: 'Clears at the next completed observation. Escalates if that window is missed too.',
  cleanup_pending: 'Clears when the finished records are reconciled. Becomes maintenance if live work starts waiting on them.',
  maintenance_required: 'Clears when the condition is corrected and the next measurement confirms it.',
  capability_reduced: 'Clears when the measurement returns above its threshold.',
  not_measured: 'Clears as soon as the source reports a metric.',
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
  const named = Object.prototype.hasOwnProperty.call(RULES, subsystemId)
  const rule = named ? RULES[subsystemId] : DEFAULT_RULE
  const ruleKey = named ? subsystemId : 'default_threshold'
  const meta = RULE_META[ruleKey] || RULE_META.default_threshold
  const status = rule.classify(score, metric, context)
  const operationalImpact = rule.impact(status, context)
  const evidence: string[] = [
    metric === null || metric === undefined ? 'no metric reported' : `measured value ${metric}`,
    `score ${score}`,
  ]
  if (context.blockedWork !== undefined) evidence.push(`${Number(context.blockedWork || 0)} blocked work item(s)`)
  if (context.runtimeIdleByDesign) evidence.push('runtime idle between scheduled executions')
  if (context.observationWindowMissed) evidence.push('an owed observation window passed without a run')
  return {
    subsystemId,
    status,
    label: DIAGNOSTIC_LABELS[status],
    score,
    explanation: rule.explain(metric, context),
    operationalImpact,
    impactStatement: IMPACT_STATEMENT[operationalImpact],
    recommendation: rule.recommend(status, metric),
    evidence,
    rule: ruleKey,
    ruleName: meta.name,
    rulePurpose: meta.purpose,
    ruleSafetyRationale: meta.safetyRationale,
    reasoning: REASONING[status],
    changesWhen: CHANGES_WHEN[status],
    inferenceChain: [
      { step: 'observation', statement: rule.explain(metric, context) },
      { step: 'rule', statement: `${meta.name} — ${meta.purpose}` },
      { step: 'evidence', statement: evidence.join(' · ') },
      { step: 'conclusion', statement: `${DIAGNOSTIC_LABELS[status]} — ${REASONING[status]}` },
      { step: 'recommendation', statement: rule.recommend(status, metric) || 'None. Nothing is owed.' },
    ],
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
  not_measured: 5,
  nominal: 6,
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
