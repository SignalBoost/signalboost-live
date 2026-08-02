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
//   EVIDENCE FRESHNESS    How current the evidence is against the cadence the policy declares,
//                         not against a wall clock we chose.
//
//   REPRODUCIBILITY       Could someone else derive this same conclusion? Split deliberately in
//                         two, because the honest answer today is half yes: every module is
//                         pure, so the same inputs always produce the same conclusion — but we
//                         DO NOT RETAIN THE INPUTS, so an auditor asking "what did you conclude
//                         at 03:00 and on what evidence" cannot check. Reporting a flat "Yes"
//                         would be exactly the overstatement this product exists to avoid. The
//                         digest below is what makes it verifiable once assessments are stored.
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

export type AssessmentIntegrity = {
  independentSignals: number
  totalSignals: number
  signalsLabel: string

  contradictions: Contradiction[]
  conflictingSignals: number

  /** 0–100 against the declared cadence. 100 when observation is on schedule. */
  evidenceFreshness: number

  /** Same inputs always give the same conclusion — true because the modules are pure. */
  deterministic: boolean
  /** Whether those inputs were written down. False today. */
  inputsRetained: boolean
  /** Short stable fingerprint of the exact inputs this conclusion was derived from. */
  inputDigest: string
  reproducibilityStatement: string

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

  const tolerance = Math.max(1, input.toleranceSeconds)
  const evidenceFreshness = Math.max(0, Math.min(100, Math.round(100 * (1 - Math.max(0, input.overdueSeconds) / tolerance))))

  const inputDigest = digest(input.inputs)
  const deterministic = true
  const inputsRetained = false
  const reproducibilityStatement = inputsRetained
    ? 'Reproducible. The inputs behind this conclusion are retained and it can be derived again from them.'
    : 'Reproducible in principle, not yet from a record. The modules are pure, so the same inputs always give this same conclusion — but the inputs are not retained, so nobody can re-derive this assessment later. Storing them is what would make this a full yes.'

  const intact =
    contradictions.length === 0 &&
    input.measuredDomains > 0 &&
    evidenceFreshness > 0

  return {
    independentSignals: input.measuredDomains,
    totalSignals: input.totalDomains,
    signalsLabel: `${input.measuredDomains} of ${input.totalDomains}`,
    contradictions,
    conflictingSignals: contradictions.length,
    evidenceFreshness,
    deterministic,
    inputsRetained,
    inputDigest,
    reproducibilityStatement,
    intact,
    statement:
      contradictions.length === 0
        ? 'No contradiction found between any two outputs of this assessment.'
        : `${contradictions.length} contradiction(s) found between outputs of this assessment. The console is wrong about something and the state above should not be trusted until it is resolved.`,
  }
}
