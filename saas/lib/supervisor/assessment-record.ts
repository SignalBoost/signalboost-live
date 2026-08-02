// saas/lib/supervisor/assessment-record.ts
//
// THE CONCLUSION, IN A SHAPE THAT OUTLIVES THE PAGE VIEW.
//
// Everything the console shows is derived by pure modules from a set of inputs. This file
// packages both halves — the inputs and what was concluded from them — into one record that
// can be written down, read back, and re-derived.
//
// TWO RULES THAT MAKE THE RECORD WORTH KEEPING.
//
//   1. THE INPUTS ARE VERBATIM AND COMPLETE. Every figure the modules consumed goes in, in
//      the same form they consumed it. A record that stores a summary of its inputs proves
//      nothing: replaying a summary cannot reproduce the conclusion, and an auditor is then
//      being asked to trust the summariser instead of the evidence.
//
//   2. THE MODULE VERSION TRAVELS WITH IT. A conclusion is reproducible against the code that
//      produced it, not against whatever is deployed the day someone asks. Bump MODULE_VERSION
//      whenever a change would alter a conclusion from unchanged inputs — a new deduction, a
//      changed threshold, a new contradiction check. A version that never moves while the
//      reasoning does is worse than no version, because it asserts a reproducibility that is
//      no longer true.
//
// PURE, NO IMPORTS. The store that writes these lives in assessment-ledger.ts.

/**
 * Bump when a change would produce a different conclusion from identical inputs.
 *
 * Formatting changes, copy, and new fields that only add detail do not count. Anything that
 * moves a state, a confidence figure, a forecast or a contradiction check does.
 */
export const MODULE_VERSION = '2026-08-02.1'

export type AssessmentInputsSnapshot = {
  observationsExpected: number
  observationsCompleted: number
  blockedWork: number
  queueDepth: number
  confirmedServiceFailures: number
  reducedCapabilities: string[]
  verificationAttempted: number
  verificationFailed: number
  auditGaps: number
  unmeasuredDomains: string[]
  unverifiableLiveness: string[]
  expiredLeasesWithWork: number
  reconciliationBacklog: number
  missedObservationWindows: number
  observationIntervalSeconds: number | null
  overdueSeconds: number
  toleranceSeconds: number
  lastObservationAt: string | null
  newestEvidenceSeconds: number | null
  oldestEvidenceSeconds: number | null
}

export type AssessmentRecord = {
  environment: string
  operationalState: string
  impactAffected: boolean
  confidence: number
  pageOnCall: boolean
  contradictions: number
  /** The full justification: basis, confidence ledger, forecast, integrity, diagnostics. */
  assessment: Record<string, unknown>
  inputs: AssessmentInputsSnapshot
  inputDigest: string
  moduleVersion: string
}

export type RecordSources = {
  environment?: string
  state: string
  impactAffected: boolean
  confidence: number
  pageOnCall: boolean
  stateReason: string
  impact: string
  basis: Array<{ label: string; value: string; polarity: string }>
  confidenceReasons: Array<{ code: string; label: string; penalty: number }>
  forecasts: Array<{ code: string; observed: string; trigger: string; consequence: string; exposure: string }>
  contradictions: Array<{ code: string; statement: string }>
  evidenceAgeState: string
  diagnosticsNominal: number
  diagnosticsAttention: number
  score: number | null
  inputs: AssessmentInputsSnapshot
  inputDigest: string
}

/**
 * Assemble the record.
 *
 * `assessment` holds the justification rather than a rendered page: the basis lines with
 * their polarity, every confidence deduction with its cost, the forecast set, any
 * contradictions, and the diagnostic counts. Enough to reconstruct what an operator saw and
 * why — and deliberately not the copy they saw it in, which is presentation and changes for
 * reasons that have nothing to do with what was concluded.
 */
export function buildAssessmentRecord(sources: RecordSources): AssessmentRecord {
  return {
    environment: sources.environment || 'production',
    operationalState: sources.state,
    impactAffected: sources.impactAffected,
    confidence: sources.confidence,
    pageOnCall: sources.pageOnCall,
    contradictions: sources.contradictions.length,
    assessment: {
      stateReason: sources.stateReason,
      impact: sources.impact,
      basis: sources.basis,
      confidenceReasons: sources.confidenceReasons,
      forecasts: sources.forecasts,
      contradictions: sources.contradictions,
      evidenceAgeState: sources.evidenceAgeState,
      diagnostics: { nominal: sources.diagnosticsNominal, attention: sources.diagnosticsAttention },
      score: sources.score,
    },
    inputs: sources.inputs,
    inputDigest: sources.inputDigest,
    moduleVersion: MODULE_VERSION,
  }
}

export type StoredAssessment = {
  recordedAt: string
  operationalState: string
  impactAffected: boolean
  confidence: number
  pageOnCall: boolean
  contradictions: number
  inputDigest: string
  moduleVersion: string
}

export type AssessmentContinuity = {
  /** Consecutive most-recent stored assessments that reached the same state. */
  consecutive: number
  /** When the state last changed to what it is now. Null when unknown. */
  sinceAt: string | null
  durationSeconds: number
  /** The streak covers every retained record, so the real figure is "at least" this. */
  windowExhausted: boolean
  /** False when there is no stored history yet — report as not measured, not as stable. */
  measured: boolean
  /** The state before the current run of them, when the ledger reaches back that far. */
  previousState: string | null
}

const NOT_MEASURED: AssessmentContinuity = {
  consecutive: 0,
  sinceAt: null,
  durationSeconds: 0,
  windowExhausted: false,
  measured: false,
  previousState: null,
}

/**
 * How long the current conclusion has actually held, from stored conclusions.
 *
 * This is the honest version of what the observation record could only approximate. The
 * observation streak answered "has any run contradicted us"; this answers "when did the state
 * last change", which is the question an operator was asking all along.
 *
 * The "at least" hedge does not disappear — it moves. While the ledger holds a state change
 * the streak is exact; once the streak reaches the oldest retained record the limit is
 * retention again, and the record says so rather than implying the platform has been this way
 * since the beginning of time.
 */
export function assessContinuity(records: StoredAssessment[], currentState: string): AssessmentContinuity {
  const usable = records
    .filter(record => Number.isFinite(Date.parse(record.recordedAt)))
    .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))

  if (usable.length === 0) return NOT_MEASURED

  let consecutive = 0
  for (const record of usable) {
    if (record.operationalState !== currentState) break
    consecutive += 1
  }

  if (consecutive === 0) {
    return { ...NOT_MEASURED, measured: true, previousState: usable[0].operationalState }
  }

  const newest = Date.parse(usable[0].recordedAt)
  const oldestInStreak = usable[consecutive - 1]
  return {
    consecutive,
    sinceAt: oldestInStreak.recordedAt,
    durationSeconds: Math.max(0, Math.round((newest - Date.parse(oldestInStreak.recordedAt)) / 1000)),
    windowExhausted: consecutive === usable.length,
    measured: true,
    previousState: consecutive < usable.length ? usable[consecutive].operationalState : null,
  }
}
