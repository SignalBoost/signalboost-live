// saas/lib/supervisor/health-ledger.ts
//
// WHERE THE MISSING POINTS WENT — AND ONLY THE ONES THAT REPRESENT REALITY.
//
// A score with no explanation is decoration: "93%" prompts one question, and a console that
// cannot answer what is wrong with the other seven has not said anything. So the score is a
// CONSEQUENCE here, reconstructed as a ledger where every point lost carries its cause, its
// evidence, its operational impact, a confidence and a recommendation.
//
// WHAT CHANGED IN THIS VERSION, AND WHY IT MATTERS. The first ledger mixed two different
// things in one list: real operational deductions, and points lost to quirks of the scoring
// formula, the latter marked "expected". That was the wrong shape. Nobody accountable wants
// to be told "we always lose seven points because the formula double-counts" — they want the
// formula fixed. A transparency layer that makes a flawed algorithm comfortable to live with
// will keep it alive forever.
//
// So there are now two separate outputs:
//
//   OPERATIONAL DEDUCTIONS  things that are true about the platform. These affect the score.
//   FORMULA DIAGNOSTICS     engineering notes about the measurement itself. These affect
//                           NOTHING, sit in their own section, and each carries what would
//                           remove it — the intent is to delete them, not to live beside them.
//
// The domain model in health-domains.ts is the other half of that fix: eight domains, each
// measured once, no overlaps. The goal state is a ledger reading "100. No deductions." on a
// healthy platform, with an empty diagnostics list.
//
// It explains; it does not fetch, and it does not decide severity — health-severity.ts asks
// whether anything is actually broken.

import type { DomainAssessment, DomainSnapshot } from './health-domains.ts'

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
}

export type FormulaDiagnostic = {
  code: string
  note: string
  /** What would remove it. A diagnostic with no fix is a complaint. */
  remedy: string
}

export type HealthMetric = { label: string; value: string; meaning: string }

export type HealthLedger = {
  startScore: number
  /** Only things that are true about the platform. */
  deductions: HealthDeduction[]
  /** Notes about the measurement. Deliberately excluded from the arithmetic. */
  diagnostics: FormulaDiagnostic[]
  /** Reproduces the domain snapshot's score, or null when nothing could be measured. */
  score: number | null
  /** False would mean the explanation and the number disagree, which must never ship. */
  reconciles: boolean
  /** How much of the picture the score represents. */
  coverage: string
  unmeasured: Array<{ label: string; why: string }>
  metrics: HealthMetric[]
}

const IMPACT: Record<string, string> = {
  execution: 'Work was dispatched and did not run, so remediation did not happen.',
  observation: 'Owed observations did not happen, so a fault could exist unseen.',
  verification: 'An outcome was not independently confirmed, so a repair may be reported without proof.',
  audit: 'No service impact. The evidence trail is incomplete, which is a compliance problem rather than an outage.',
  persistence: 'Durable writes failed, so recent state may not survive a restart.',
  coordination: 'Work may sit unclaimed, or held by a runtime that has gone.',
  provider_connectivity: 'A provider cannot be reached, or cannot reach us, so its events are lost rather than queued.',
  business_impact: 'Work is blocked. This is the domain that decides whether there is an outage.',
}

const RECOMMENDATION: Record<string, string> = {
  execution: 'Inspect the failing dispatches before approving further remediation.',
  observation: 'Check why the scheduled runs are not firing. A run that never fires is invisible to elapsed-time checks.',
  verification: 'Treat unconfirmed outcomes as unproven, not as successes.',
  audit: 'Investigate audit persistence before the next compliance review. Not an out-of-hours matter.',
  persistence: 'Check the durable store before trusting any recent state.',
  coordination: 'Reconcile expired leases so their work can be reclaimed.',
  provider_connectivity: 'Correct the registration or the receiver. Refusal is the safe behaviour, not the fault.',
  business_impact: 'Free the blocked work — this is the only line here that justifies waking someone.',
}

const CONFIDENCE: Record<string, 'high' | 'medium' | 'low'> = {
  business_impact: 'high',
  audit: 'high',
  coordination: 'medium',
  provider_connectivity: 'medium',
}

export type LedgerContext = {
  snapshot: DomainSnapshot
}

function deductionFor(domain: DomainAssessment, share: number): HealthDeduction | null {
  if (!domain.measured || domain.score === null || domain.score >= 100) return null
  return {
    code: domain.id,
    label: domain.label,
    // Each measured domain is one equal share of the score, so the ledger sums back exactly.
    points: ((100 - Number(domain.score)) * share) / 100,
    why: domain.finding || `${domain.label} scored ${domain.score}.`,
    evidence: domain.evidence,
    impact: IMPACT[domain.id] || 'Impact not characterised for this domain.',
    confidence: CONFIDENCE[domain.id] || 'high',
    recommendation: RECOMMENDATION[domain.id] || 'Investigate before the next review.',
  }
}

/**
 * Rebuild the score as justified deductions, with measurement complaints kept out of it.
 *
 * The arithmetic is the domain snapshot's own — each measured domain is an equal share — so
 * the ledger always reproduces the number the rest of the system reports. A ledger explaining
 * a different score would be a second opinion pretending to be an explanation.
 */
export function buildHealthLedger(context: LedgerContext): HealthLedger {
  const snapshot = context.snapshot
  const measured = snapshot.domains.filter(domain => domain.measured)
  const share = measured.length ? 100 / measured.length : 0

  const deductions: HealthDeduction[] = []
  for (const domain of measured) {
    const deduction = deductionFor(domain, share)
    if (deduction) deductions.push(deduction)
  }

  const lost = deductions.reduce((total, item) => total + item.points, 0)
  const score = measured.length ? Math.round(100 - lost) : null

  // Notes about the measurement, never about the platform. Each carries what would remove it,
  // because the point is to delete these over time rather than to live beside them.
  const diagnostics: FormulaDiagnostic[] = []
  if (snapshot.unmeasured.length) {
    diagnostics.push({
      code: 'partial_coverage',
      note: `${snapshot.coverage}. The score describes only what was measured, and an unmeasured domain is not evidence of health.`,
      remedy: 'Collect the missing signals so every domain is measured on its own evidence.',
    })
  }
  if (snapshot.unmeasured.indexOf('persistence') !== -1) {
    diagnostics.push({
      code: 'persistence_unmeasured',
      note: 'Persistence has no independent signal. It is deliberately not inferred from audit completeness — that would be one measurement counted twice, which is the flaw this model was rebuilt to remove.',
      remedy: 'Record durable-write outcomes and feed them in, or leave the domain honestly unmeasured.',
    })
  }

  return {
    startScore: 100,
    deductions,
    diagnostics,
    score,
    // If these disagree the explanation is wrong, and a wrong explanation is worse than none.
    reconciles: score === snapshot.score,
    coverage: snapshot.coverage,
    unmeasured: snapshot.domains
      .filter(domain => !domain.measured)
      .map(domain => ({ label: domain.label, why: domain.evidence[0] || 'No signal.' })),
    metrics: measured.map(domain => ({
      label: domain.label,
      value: `${domain.score}%`,
      meaning: domain.question,
    })),
  }
}

/** "−12 Coordination" — display rounding only; the ledger sums exactly. */
export function formatDeduction(deduction: HealthDeduction): string {
  const points = deduction.points >= 1 ? Math.round(deduction.points) : Number(deduction.points.toFixed(1))
  return `−${points} ${deduction.label}`
}

/** The headline a healthy platform should produce: a full score and nothing to explain. */
export function isClean(ledger: HealthLedger): boolean {
  return ledger.deductions.length === 0 && ledger.score === 100
}
