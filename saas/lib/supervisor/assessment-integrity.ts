// saas/lib/supervisor/assessment-integrity.ts
//
// "HOW DO I KNOW YOUR ASSESSMENT WASN'T HALLUCINATED?"
//
// That question arrives the moment a buyer takes this seriously, and every other block on the
// console answers a different one. Operational state says what is true. Confidence says how
// well we know it. The basis says what it rests on. None of them says whether the ASSESSMENT
// ITSELF holds together — whether its inputs corroborate each other, whether any two of its
// outputs disagree, and whether a third party could run it again and get the same answer.
//
// FOUR MEASURES, AND EACH ONE IS CAPABLE OF FAILING.
//
//   INDEPENDENT SIGNALS   How many domains contributed a measurement of their own. Five of six
//                         is a real number; six of six from one shared source would not be.
//
//   CONTRADICTIONS        Pairs of outputs that cannot both be right. These are checked, not
//                         assumed — the whole rebuild started because the console printed
//                         "Operational" above "critical" and nothing noticed.
//
//   EVIDENCE AGE          How current the evidence is, against the cadence the policy declares
//                         rather than a wall clock we chose. STATED AS AGES AND A STATE, not as
//                         a bare percentage: "Evidence freshness 23%" reads like a failing grade
//                         and answers nothing — 23% of what? The score still exists, because the
//                         arithmetic should be inspectable, but it sits behind the two figures a
//                         person can actually act on: how old is the newest evidence, and how old
//                         is the oldest.
//
//   REPRODUCIBILITY       Could someone else derive this same conclusion? Split deliberately in
//                         two, because the honest answer today is half yes: every module is
//                         pure, so the same inputs always produce the same conclusion — the
//                         remaining question is whether the INPUTS were written down. When the
//                         assessment ledger has them, an auditor asking "what did you conclude
//                         at 03:00 and on what evidence" can check, and this reports FULL. When
//                         it does not, it reports PARTIAL with the reason and the path out.
//                         Whether the ledger holds them is a fact the caller supplies; this
//                         module never assumes it, because assuming would turn the one honest
//                         field on the page into the same overclaim it was written to avoid.
//
// A CONTRADICTION IS NEVER SMOOTHED OVER. It is reported as a failure of the assessment, and
// it deliberately does not change the operational state — an internal inconsistency is a
// reason to distrust the console, not evidence about the business.
//
// PURE, NO IMPORTS.

export type Contradiction = {
  code: string
  /** The two statements that cannot both be true. */
  statement: string
  /** What to do about it. Always fix the console, never the state. */
  remedy: string
}

export type FreshnessState = 'within_policy' | 'aging' | 'outside_policy' | 'not_measured'

export const FRESHNESS_LABELS: Record<FreshnessState, string> = {
  within_policy: 'Within declared policy',
  aging: 'Aging — still within tolerance',
  outside_policy: 'Outside declared policy',
  not_measured: 'No evidence recorded',
}

export type EvidenceAge = {
  state: FreshnessState
  stateLabel: string
  /** Age of the most recent piece of evidence, in seconds. Null when there is none. */
  newestSeconds: number | null
  /** Age of the oldest piece still counted toward this assessment. */
  oldestSeconds: number | null
  /** Kept because the arithmetic should be inspectable — but never the headline. */
  score: number
  /** Every figure the score was computed from, so the expansion can show its working. */
  scoreBasis: string[]
}

export type ReproducibilityLevel = 'none' | 'partial' | 'full'

export type Reproducibility = {
  level: ReproducibilityLevel
  levelLabel: string
  /** Why it is not full. Empty when it is. */
  reason: string
  /** What would make it full. A limitation with no named path out of it is an excuse. */
  roadmap: string
  /** Short stable fingerprint of the exact inputs this conclusion was derived from. */
  digest: string
  /** Same inputs always give the same conclusion — true because the modules are pure. */
  deterministic: boolean
  inputsRetained: boolean
}

export type AssessmentIntegrity = {
  independentSignals: number
  totalSignals: number
  signalsLabel: string

  contradictions: Contradiction[]
  conflictingSignals: number

  evidenceAge: EvidenceAge
  reproducibility: Reproducibility

  /** True only when every measure above holds. */
  intact: boolean
  statement: string
}

export type IntegrityInput = {
  /** Domains that contributed their own measurement. */
  measuredDomains: number
  totalDomains: number

  // ── The facts each contradiction check compares ────────────────────────────
  operationalState: string
  blockedWork: number
  confidence: number
  limitingBasisLines: number
  /** Diagnostics reporting confirmed operational impact. */
  diagnosticsWithConfirmedImpact: number
  /** The health ledger agrees with the domain model it was built from. */
  ledgerReconciles: boolean
  /** Stability claims an unbroken streak. */
  stabilityConsecutive: number
  /** The most recent observation contradicts the conclusion. */
  newestObservationContradicts: boolean

  // ── Freshness, against the declared cadence ────────────────────────────────
  overdueSeconds: number
  toleranceSeconds: number

  /** Age of the newest piece of evidence, in seconds. Null when there is none at all. */
  newestEvidenceSeconds: number | null
  /** Age of the oldest piece still counted toward this assessment. */
  oldestEvidenceSeconds: number | null

  /** True when this conclusion's inputs were written to the assessment ledger. Supplied by
   *  the caller from the actual write result — never assumed, never defaulted to true. */
  inputsRetained?: boolean

  /** Anything that identifies the inputs. Order-independent; hashed, never displayed raw. */
  inputs: Array<string | number | boolean | null>
}

/**
 * FNV-1a, 32-bit. Not a security hash and not used as one — it exists so two people looking at
 * the same conclusion can tell whether they are looking at the same inputs.
 */
function digest(values: Array<string | number | boolean | null>): string {
  const canonical = values.map(value => (value === null ? 'null' : String(value))).join('|')
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/**
 * Check the assessment against itself.
 *
 * Every check here compares two figures that were computed independently. If they disagree,
 * the console is wrong about something and says so, in the same block that would otherwise be
 * reassuring the reader.
 */
export function buildAssessmentIntegrity(input: IntegrityInput): AssessmentIntegrity {
  const contradictions: Contradiction[] = []

  if (input.operationalState === 'operational' && input.blockedWork > 0) {
    contradictions.push({
      code: 'state_vs_blocked_work',
      statement: `The state is Operational while ${input.blockedWork} work item(s) are blocked.`,
      remedy: 'The impact check and the work query disagree. Trust neither line until they are reconciled.',
    })
  }

  if (input.confidence >= 100 && input.limitingBasisLines > 0) {
    contradictions.push({
      code: 'confidence_vs_limits',
      statement: `Confidence is ${input.confidence}% while ${input.limitingBasisLines} fact(s) are marked as limiting the conclusion.`,
      remedy: 'A limiting fact must cost confidence. One of the two is not counting something it should.',
    })
  }

  if (input.operationalState === 'operational' && input.diagnosticsWithConfirmedImpact > 0) {
    contradictions.push({
      code: 'diagnostic_vs_state',
      statement: `${input.diagnosticsWithConfirmedImpact} diagnostic(s) report confirmed operational impact while the state is Operational.`,
      remedy: 'This is the original defect in a new place. The diagnostic and the assessment must be reading the same blocked-work figure.',
    })
  }

  if (!input.ledgerReconciles) {
    contradictions.push({
      code: 'ledger_vs_domains',
      statement: 'The score ledger does not reconcile with the domain model it was built from.',
      remedy: 'The arithmetic is wrong somewhere. Treat the score as unusable until the deductions add up.',
    })
  }

  if (input.stabilityConsecutive > 0 && input.newestObservationContradicts) {
    contradictions.push({
      code: 'stability_vs_record',
      statement: 'Continuity claims an unbroken streak while the most recent observation contradicts the conclusion.',
      remedy: 'The streak and the impact check are using different predicates. They must use one.',
    })
  }

  // ── Evidence age, expressed the way a person reads it ──────────────────────
  const tolerance = Math.max(1, input.toleranceSeconds)
  const overdue = Math.max(0, input.overdueSeconds)
  const score = Math.max(0, Math.min(100, Math.round(100 * (1 - overdue / tolerance))))
  const freshnessState: FreshnessState =
    input.newestEvidenceSeconds === null || input.newestEvidenceSeconds === undefined
      ? 'not_measured'
      : overdue === 0
        ? 'within_policy'
        : overdue >= tolerance
          ? 'outside_policy'
          : 'aging'
  const evidenceAge: EvidenceAge = {
    state: freshnessState,
    stateLabel: FRESHNESS_LABELS[freshnessState],
    newestSeconds: input.newestEvidenceSeconds ?? null,
    oldestSeconds: input.oldestEvidenceSeconds ?? null,
    score,
    // The working, so the number can be checked rather than believed.
    scoreBasis: [
      input.newestEvidenceSeconds === null || input.newestEvidenceSeconds === undefined
        ? 'no evidence recorded'
        : `newest evidence ${input.newestEvidenceSeconds}s old`,
      `overdue by ${overdue}s`,
      `tolerance ${tolerance}s`,
      'score = 100 × (1 − overdue ÷ tolerance)',
    ],
  }

  // ── Reproducibility, as a level with a way out ─────────────────────────────
  const inputsRetained = input.inputsRetained === true
  const reproducibility: Reproducibility = {
    level: inputsRetained ? 'full' : 'partial',
    levelLabel: inputsRetained ? 'Full' : 'Partial',
    reason: inputsRetained
      ? ''
      : 'The inputs behind this conclusion are not in the assessment ledger, so it cannot be re-derived later from a stored record.',
    roadmap: inputsRetained
      ? 'The stored inputs and this fingerprint are what a replay is checked against. Feeding them back through the same module version must produce this same conclusion.'
      : 'Full replay becomes available once the inputs are recorded in the assessment ledger. The fingerprint beside this line is what a stored record would be matched against.',
    digest: digest(input.inputs),
    deterministic: true,
    inputsRetained,
  }

  const intact =
    contradictions.length === 0 &&
    input.measuredDomains > 0 &&
    freshnessState !== 'outside_policy' &&
    freshnessState !== 'not_measured'

  return {
    independentSignals: input.measuredDomains,
    totalSignals: input.totalDomains,
    signalsLabel: `${input.measuredDomains} of ${input.totalDomains}`,
    contradictions,
    conflictingSignals: contradictions.length,
    evidenceAge,
    reproducibility,
    intact,
    statement:
      contradictions.length === 0
        ? 'No contradiction found between any two outputs of this assessment.'
        : `${contradictions.length} contradiction(s) found between outputs of this assessment. The console is wrong about something and the state above should not be trusted until it is resolved.`,
  }
}
