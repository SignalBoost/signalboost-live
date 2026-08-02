// saas/lib/supervisor/health-ledger.ts
//
// WHERE THE MISSING POINTS WENT.
//
// A score with no explanation is not usable in operations. "93%" prompts exactly one
// question — what is wrong with the other seven — and if the console cannot answer it, the
// number is decoration. Worse, it is unauditable: asked why the platform was at 93 on a
// given night, the only honest answer today is "because the formula said so", which is not
// something a CISO, an auditor or an on-call engineer can act on.
//
// So the score stops being a primary output and becomes a CONSEQUENCE. This file reconstructs
// it as a ledger: start at 100, and every point lost carries its cause, its evidence, its
// operational impact, a confidence level and a recommendation. Every deduction answers the
// same five questions the rest of the Supervisor answers — what happened, what it proves,
// what it costs, how sure we are, and what to do.
//
// THE LEDGER RECONCILES EXACTLY. Deductions are derived from the same component scores the
// existing snapshot averages, so the total always reproduces the number the rest of the
// system computes. A ledger that explained a different score would be a second opinion
// pretending to be an explanation.
//
// A DEDUCTION CAN BE EXPECTED. A scheduled runtime idle between runs costs points under the
// current formula, and that is the formula being wrong rather than the platform being
// unwell. Those deductions are marked `expected: true` with a recommendation of no action,
// so an operator can see at a glance that the shortfall is arithmetic rather than a fault.
//
// PURE, NO IMPORTS. It explains; it does not fetch, and it does not decide severity — that
// belongs to health-severity.ts, which asks whether anything is actually broken.

export type HealthDeduction = {
  code: string
  label: string
  /** Exact points lost, possibly fractional. Display rounds; the sum does not. */
  points: number
  why: string
  evidence: string[]
  impact: string
  confidence: 'high' | 'medium' | 'low'
  recommendation: string
  /** True when this deduction is normal for the declared execution model. */
  expected: boolean
}

export type HealthMetric = { label: string; value: string; meaning: string }

export type HealthLedger = {
  startScore: number
  deductions: HealthDeduction[]
  /** Reproduces the snapshot's own score. */
  score: number
  /** False would mean the explanation and the number disagree, which must never ship. */
  reconciles: boolean
  /** The figures an operator actually reads, instead of one opaque percentage. */
  metrics: HealthMetric[]
  /** Honest notes about the formula itself, where it has a known weakness. */
  formulaNotes: string[]
}

export type ComponentScores = {
  availability: number
  reliability: number
  verificationRate: number
  auditSuccess: number
  schedulerSuccess: number
  webhookSuccess: number
  supervisorHealth: number
  providerHealth: number
  queueHealth: number
}

export type LedgerContext = {
  components: ComponentScores
  /** Subsystem metrics, used as the evidence line for each deduction. */
  subsystems?: Array<{ id: string; score: number; metric: number | null; summary: string }>
  /** True when the runtime being scored is scheduled and legitimately idle right now. */
  runtimeIdleByDesign?: boolean
  totalObservations?: number
  blockedWork?: number
  queueDepth?: number
}

type Explanation = {
  label: string
  why: (context: LedgerContext, score: number) => string
  impact: (context: LedgerContext, score: number) => string
  recommendation: (context: LedgerContext, score: number) => string
  expected?: (context: LedgerContext) => boolean
  evidenceSubsystems: string[]
  confidence?: 'high' | 'medium' | 'low'
}

const EXPLANATIONS: Record<keyof ComponentScores, Explanation> = {
  availability: {
    label: 'Supervisor availability',
    evidenceSubsystems: ['supervisor', 'missed_heartbeats'],
    why: context => context.runtimeIdleByDesign
      ? 'The runtime is idle between scheduled executions, which the current formula scores as reduced availability.'
      : 'A supervisor instance is missing or its heartbeat is stale.',
    impact: context => context.runtimeIdleByDesign
      ? 'None. An idle scheduled runtime is the expected steady state between runs.'
      : 'New work would not be picked up while no instance is beating.',
    recommendation: context => context.runtimeIdleByDesign
      ? 'No action. This deduction reflects the scoring formula, not the platform.'
      : 'Confirm the runtime is running and its heartbeat is being written.',
    expected: context => context.runtimeIdleByDesign === true,
  },
  supervisorHealth: {
    label: 'Supervisor fleet health',
    evidenceSubsystems: ['supervisor', 'missed_heartbeats'],
    why: context => context.runtimeIdleByDesign
      ? 'Same idle runtime, scored a second time — the formula counts the supervisor score in two of its nine components.'
      : 'The supervisor fleet has no healthy instance, or one has a stale heartbeat.',
    impact: context => context.runtimeIdleByDesign
      ? 'None. Counted twice, so an idle scheduled runtime costs roughly seven points on its own.'
      : 'Remediation cannot be dispatched without a healthy instance.',
    recommendation: context => context.runtimeIdleByDesign
      ? 'No action. Worth fixing in the formula rather than in the platform.'
      : 'Restore a healthy supervisor instance.',
    expected: context => context.runtimeIdleByDesign === true,
  },
  reliability: {
    label: 'Reliability (composite)',
    evidenceSubsystems: ['verification_failures', 'audit_failures', 'scheduler', 'webhook_processing'],
    why: () => 'The average of verification, audit, scheduler and webhook success — each of which is ALSO scored separately below.',
    impact: () => 'None of its own. This line restates the four rates beneath it.',
    recommendation: () => 'Read the four rates below rather than this line.',
    confidence: 'medium',
  },
  verificationRate: {
    label: 'Verification success',
    evidenceSubsystems: ['verification_failures', 'verification_latency'],
    why: () => 'Observation runs that failed to read or verify.',
    impact: () => 'A failed verification means an incident may be missed, or a repair reported as done without proof.',
    recommendation: () => 'Inspect the failing runs; a persistent failure is a genuine gap in evidence.',
  },
  auditSuccess: {
    label: 'Audit completeness',
    evidenceSubsystems: ['audit_failures', 'audit_latency', 'persistence_latency'],
    why: () => 'Runs with no terminal audit event, so their outcome was never durably recorded.',
    impact: () => 'No service impact. The evidence trail is incomplete, which is a compliance problem rather than an outage.',
    recommendation: () => 'Investigate audit persistence before the next compliance review. Not an out-of-hours matter.',
  },
  schedulerSuccess: {
    label: 'Scheduler success',
    evidenceSubsystems: ['scheduler'],
    why: () => 'Scheduled triggers that failed.',
    impact: () => 'Observations may not be firing on their declared cadence.',
    recommendation: () => 'Check the scheduler; a run that never fires is invisible to elapsed-time checks.',
  },
  webhookSuccess: {
    label: 'Webhook processing',
    evidenceSubsystems: ['webhook_processing'],
    why: () => 'Inbound webhook deliveries that failed to process.',
    impact: () => 'Events pushed by a provider may have been dropped rather than queued.',
    recommendation: () => 'Check the receiver and replay if the provider supports it.',
  },
  providerHealth: {
    label: 'Provider registration',
    evidenceSubsystems: ['bpal_registry', 'provider_registration'],
    why: () => 'A registered provider violates its declared limits, or publishes no capabilities.',
    impact: () => 'Execution against that provider stays refused until it validates, so nothing runs on it.',
    recommendation: () => 'Correct the registration. Refusal is the safe behaviour, not the fault.',
  },
  queueHealth: {
    label: 'Queue depth',
    evidenceSubsystems: ['queue_depth', 'active_work', 'stale_work'],
    why: context => `${context.queueDepth ?? 0} active work item(s) — the formula deducts above 25 and again above 100.`,
    impact: () => 'A growing queue delays remediation without stopping it.',
    recommendation: () => 'Watch the trend. A queue that only grows is a capacity problem, not an incident.',
  },
}

const COMPONENT_ORDER: Array<keyof ComponentScores> = [
  'availability', 'supervisorHealth', 'reliability', 'verificationRate',
  'auditSuccess', 'schedulerSuccess', 'webhookSuccess', 'providerHealth', 'queueHealth',
]

function evidenceFor(context: LedgerContext, ids: string[]): string[] {
  const out: string[] = []
  for (const id of ids) {
    const subsystem = (context.subsystems || []).find(item => item.id === id)
    if (!subsystem) continue
    const metric = subsystem.metric === null || subsystem.metric === undefined ? '' : ` (${subsystem.metric})`
    out.push(`${id}: ${subsystem.score}%${metric} — ${subsystem.summary}`)
  }
  return out
}

/**
 * Rebuild the score as a list of justified deductions.
 *
 * The arithmetic is the snapshot's own: each component is one ninth of the total, so a
 * component at 70 costs (100 − 70) ÷ 9 points. That is why the ledger always sums back to the
 * number the rest of the system reports.
 */
export function buildHealthLedger(context: LedgerContext): HealthLedger {
  const components = context.components
  const count = COMPONENT_ORDER.length
  const deductions: HealthDeduction[] = []

  for (const key of COMPONENT_ORDER) {
    const score = Number(components[key])
    if (!Number.isFinite(score) || score >= 100) continue
    const explanation = EXPLANATIONS[key]
    const points = (100 - score) / count
    deductions.push({
      code: key,
      label: explanation.label,
      points,
      why: explanation.why(context, score),
      evidence: evidenceFor(context, explanation.evidenceSubsystems),
      impact: explanation.impact(context, score),
      confidence: explanation.confidence || 'high',
      recommendation: explanation.recommendation(context, score),
      expected: explanation.expected ? explanation.expected(context) === true : false,
    })
  }

  const lost = deductions.reduce((total, item) => total + item.points, 0)
  const score = Math.round(100 - lost)
  const snapshotScore = Math.round(
    COMPONENT_ORDER.reduce((total, key) => total + Number(components[key] || 0), 0) / count,
  )

  const formulaNotes: string[] = []
  if (deductions.some(item => item.code === 'reliability')) {
    // Surfaced rather than hidden. An operator comparing the lines will notice the overlap,
    // and a product that noticed it first is more credible than one that explains it after.
    formulaNotes.push('Verification, audit, scheduler and webhook success are each counted twice — once on their own and once inside Reliability. The score below is reproduced faithfully, but the formula overweights those four.')
  }
  if (deductions.some(item => item.code === 'availability') && deductions.some(item => item.code === 'supervisorHealth')) {
    formulaNotes.push('Supervisor health is counted twice, as Availability and again on its own. An idle scheduled runtime therefore costs about seven points for one condition.')
  }

  return {
    startScore: 100,
    deductions,
    score,
    // If these ever disagree the explanation is wrong, and an explanation that does not match
    // the number is worse than no explanation.
    reconciles: score === snapshotScore,
    metrics: [
      { label: 'Verification success', value: `${Math.round(components.verificationRate)}%`, meaning: 'Observations that read and verified successfully.' },
      { label: 'Audit completeness', value: `${Math.round(components.auditSuccess)}%`, meaning: 'Runs whose outcome was durably recorded.' },
      { label: 'Scheduler success', value: `${Math.round(components.schedulerSuccess)}%`, meaning: 'Scheduled triggers that fired and processed.' },
      { label: 'Observations', value: String(context.totalObservations ?? 0), meaning: 'Runs in the current window.' },
      { label: 'Blocked work', value: String(context.blockedWork ?? 0), meaning: 'Live work items with no owner. This is the number that decides an outage.' },
    ],
    formulaNotes,
  }
}

/** "−3 Supervisor availability" — display rounding only; the ledger sums exactly. */
export function formatDeduction(deduction: HealthDeduction): string {
  const points = deduction.points >= 1 ? Math.round(deduction.points) : Number(deduction.points.toFixed(1))
  return `−${points} ${deduction.label}`
}

/** True when every point lost is accounted for by a condition that is normal. */
export function allDeductionsExpected(ledger: HealthLedger): boolean {
  return ledger.deductions.length > 0 && ledger.deductions.every(item => item.expected || item.code === 'reliability')
}
