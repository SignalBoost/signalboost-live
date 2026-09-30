//
// Owner direction 2026-09-30: deal with the students in quarantine. "Quarantined" on its own says nothing. A student
// is there because it sat the exam and failed on merit, because its Residency ended in a FAIL, because it spent its
// three real exam attempts, because OUR infrastructure failures were once counted against it (the quarantine review
// returns those to the exam), or because its frozen exam data is broken (ours: it was never examined, so it is not a
// FAIL). This names the reason for every quarantined student from the durable assurance events.
//
// Owner direction 2026-09-30 (later): quarantine is not a place to stay forever. "If they are there because of our
// infrastructure fix it - if because they are incompetent delete them." The resolution
// (cosUniversityQuarantineResolution.ts) acts on the reason named here. This module stays pure: it decides nothing on
// its own, grants nothing and never changes a status. A FAIL stays a FAIL; the standard is never lowered.

import {
  decideExhaustedMassEvaluationArtifacts,
  decideWronglyExhaustedMassEvaluationArtifacts,
  type RollingEvent,
} from './cosUniversityMassEvaluationRollingAuthority.ts'
import { isTerminalHoldoutDataDefect } from './cosUniversityMassEvaluationTerminalDefect.ts'

export const QUARANTINE_REASONS = Object.freeze([
  'exam_failed',
  'residency_failed',
  'exhausted_real_failures',
  'exhausted_our_errors',
  'exam_data_defect',
  'no_recorded_reason',
] as const)
export type QuarantineReason = typeof QUARANTINE_REASONS[number]

/** Results. Final by design; nothing in the University reopens them. */
export const FINAL_QUARANTINE_REASONS: readonly QuarantineReason[] = Object.freeze([
  'exam_failed',
  'residency_failed',
  'exhausted_real_failures',
])

export const QUARANTINE_REVIEW_LANE = 'cos-university-mass-quarantine-review' as const
export const QUARANTINE_REVIEW_PROFILE = 'cos_mass_quarantine_review_v1' as const
export const QUARANTINE_RESTORED_CLAIM = 'mass_distilled_evaluation_quarantine_restored' as const

// Written by the quarantine resolution. Defined here so the telemetry and the resolution can never disagree.
export const QUARANTINE_RESOLUTION_LANE = 'cos-university-quarantine-resolution' as const
export const QUARANTINE_RESOLUTION_PROFILE = 'cos_university_quarantine_resolution_v1' as const
export const QUARANTINE_DISMISSED_CLAIM = 'university_student_dismissed' as const
export const QUARANTINE_RETURNED_CLAIM = 'university_student_returned_to_exam' as const

const COMPLETED = 'mass_distilled_independent_evaluation_completed'
const FAILED = 'mass_distilled_independent_evaluation_failed'
const EXHAUSTED = 'mass_distilled_evaluation_attempts_exhausted'
const REOPENED = 'mass_distilled_independent_evaluation_reopened'
const RESIDENCY_FAILED = 'builder_residency_failed'

export type QuarantineStudent = Readonly<{
  candidateId: string
  subjectId: string
  artifactHash: string
  createdAt: string
  status: string
  residencyStanding?: string | null
  /** Latest independent evaluation row for this exact artifact, when the lane recorded one. */
  evaluation?: Readonly<{ passed: boolean; observedAt: string | null; failedGates?: readonly ExamGate[] }> | null
}>

export const EXAM_GATES = Object.freeze(['holdout', 'safety', 'transfer', 'retention'] as const)
export type ExamGate = typeof EXAM_GATES[number]

export type QuarantineClassification = Readonly<{
  reason: QuarantineReason
  final: boolean
  since: string | null
  lastError: string | null
  /** Exam FAIL: which of the four exam tests the student failed. */
  failedGates: readonly ExamGate[]
  /** Residency FAIL: which Builder competencies could no longer be cleared. */
  failedCompetencies: readonly string[]
}>

type Disposition = {
  reason: QuarantineReason | 'exhausted'
  at: number
  since: string | null
  error: string | null
  failedGates?: readonly ExamGate[]
  failedCompetencies?: readonly string[]
}

/** The exam tests a recorded verdict failed, from the evaluator's own completed-event evidence. */
export function failedGatesFromVerdict(evidence: Record<string, unknown> | null | undefined): ExamGate[] {
  const part = (key: string) => (evidence?.[key] && typeof evidence[key] === 'object' ? evidence[key] as Record<string, unknown> : null)
  const gates: ExamGate[] = []
  if (part('holdout')?.improved === false) gates.push('holdout')
  if (part('safety')?.passed === false) gates.push('safety')
  if (part('transfer')?.passed === false) gates.push('transfer')
  if (part('retention')?.passed === false) gates.push('retention')
  return gates
}

function failedCompetenciesFrom(evidence: Record<string, unknown> | null | undefined): string[] {
  const list = Array.isArray(evidence?.failedCompetencies) ? evidence!.failedCompetencies as unknown[] : []
  return [...new Set(list
    .map(item => item && typeof item === 'object' ? String((item as Record<string, unknown>).competencyId ?? '') : '')
    .map(item => item.trim().slice(0, 80))
    .filter(Boolean))]
}

/** Groups error strings by their stable code so "why" counts are readable (drops hosts, ids and numbers). */
export function errorCode(error: unknown): string {
  const text = String(error ?? '').trim().toLowerCase()
  if (!text) return ''
  const head = text.split(/[:(\n]/)[0].trim()
  return head.replace(/[0-9a-f]{8,}/g, '#').replace(/\d+/g, '#').slice(0, 90)
}

const at = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}
const clean = (value: unknown, max = 300) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return text || null
}

export function ownEvents(student: Pick<QuarantineStudent, 'candidateId' | 'artifactHash'>, events: readonly RollingEvent[]): RollingEvent[] {
  const hash = student.artifactHash.toLowerCase()
  return events.filter(event => event.candidateId === student.candidateId
    && String(event.evidence?.artifactHash ?? '').toLowerCase() === hash)
}

/**
 * Why this quarantined student is in quarantine. The most recent recorded disposition wins, because a student
 * returned to the exam and quarantined again carries the newer result. Exam dispositions count only from the
 * student's latest explicit reopen (the 2026-09-26 full retest), exactly like the evaluator's own counters: an
 * older FAIL that was deliberately reopened is not the reason the student is quarantined today.
 */
export function classifyQuarantinedStudent(input: {
  student: QuarantineStudent
  events: readonly RollingEvent[]
  now: Date
}): QuarantineClassification {
  const { student } = input
  const mine = ownEvents(student, input.events)
  const reopenedAt = mine
    .filter(event => event.verifier === 'host_controller' && event.evidence?.claim === REOPENED)
    .map(event => at(event.observedAt))
    .sort((a, b) => b - a)[0] ?? Number.NEGATIVE_INFINITY
  const current = (value: unknown) => at(value) >= reopenedAt

  const dispositions: Disposition[] = []
  for (const event of mine) {
    const claim = event.evidence?.claim
    const observed = at(event.observedAt)
    const since = clean(event.observedAt, 40)
    if (claim === RESIDENCY_FAILED) {
      dispositions.push({ reason: 'residency_failed', at: observed, since, error: null, failedCompetencies: failedCompetenciesFrom(event.evidence) })
      continue
    }
    if (!current(event.observedAt)) continue
    if (claim === COMPLETED && event.evidence?.evaluationPassed === false) {
      dispositions.push({ reason: 'exam_failed', at: observed, since, error: null, failedGates: failedGatesFromVerdict(event.evidence) })
    } else if (claim === EXHAUSTED) {
      dispositions.push({ reason: 'exhausted', at: observed, since, error: clean(event.evidence?.lastError, 500) })
    } else if (claim === FAILED
      && (event.evidence?.terminalDataDefect === true || isTerminalHoldoutDataDefect(event.evidence?.error))) {
      dispositions.push({ reason: 'exam_data_defect', at: observed, since, error: clean(event.evidence?.error, 500) })
    }
  }
  if (student.evaluation && student.evaluation.passed === false && current(student.evaluation.observedAt)) {
    dispositions.push({ reason: 'exam_failed', at: at(student.evaluation.observedAt), since: clean(student.evaluation.observedAt, 40), error: null, failedGates: student.evaluation.failedGates || [] })
  }
  if (!dispositions.some(item => item.reason === 'residency_failed') && student.residencyStanding === 'residency_failed') {
    dispositions.push({ reason: 'residency_failed', at: Number.NEGATIVE_INFINITY, since: null, error: null })
  }
  const latest = [...dispositions].sort((a, b) => b.at - a.at)[0]
  const artifact = [{ candidateId: student.candidateId, subjectId: student.subjectId, artifactHash: student.artifactHash, createdAt: student.createdAt }]

  if (!latest) {
    // No disposition recorded in this generation. The exhaustion sweep writes its record only once per artifact, so a
    // student exhausted again after a reopen can carry no new record. Ask the same counter the sweep uses.
    const spent = decideExhaustedMassEvaluationArtifacts({ artifacts: artifact, events: mine, now: input.now })
    if (spent.length) {
      const lastError = clean(spent[0].lastError, 500)
      const reason: QuarantineReason = isTerminalHoldoutDataDefect(lastError) ? 'exam_data_defect' : 'exhausted_real_failures'
      return Object.freeze({ reason, final: FINAL_QUARANTINE_REASONS.includes(reason), since: null, lastError, failedGates: [], failedCompetencies: [] })
    }
    return Object.freeze({ reason: 'no_recorded_reason', final: false, since: null, lastError: null, failedGates: [], failedCompetencies: [] })
  }

  let reason: QuarantineReason
  let lastError = latest.error
  if (latest.reason === 'exhausted') {
    // Same counter the exhaustion sweep and the quarantine review use, so the three can never disagree.
    const ours = decideWronglyExhaustedMassEvaluationArtifacts({ artifacts: artifact, events: mine, now: input.now })
    if (ours.length) {
      reason = 'exhausted_our_errors'
      lastError = clean(ours[0].lastError, 500) || lastError
    } else if (isTerminalHoldoutDataDefect(lastError)) {
      // Spent before broken exam data was recognised as terminal: every attempt re-read the same frozen bytes.
      reason = 'exam_data_defect'
    } else {
      reason = 'exhausted_real_failures'
    }
  } else {
    reason = latest.reason
  }
  // An exam FAIL whose completed event carried no gate detail takes it from the recorded evaluation row.
  const failedGates = latest.failedGates && latest.failedGates.length
    ? latest.failedGates
    : reason === 'exam_failed' ? (student.evaluation?.failedGates || []) : []
  return Object.freeze({
    reason,
    final: FINAL_QUARANTINE_REASONS.includes(reason),
    since: latest.since,
    lastError,
    failedGates: Object.freeze([...failedGates]),
    failedCompetencies: Object.freeze([...(latest.failedCompetencies || [])]),
  })
}

export type LeftUniversitySummary = Readonly<{
  total: number
  byReason: Readonly<Record<QuarantineReason, number>>
}>

export type QuarantineWhy = Readonly<{
  /** Exam FAILs, by the exam test failed (a student can fail several). */
  examGates: Readonly<Record<ExamGate, number>>
  /** Residency FAILs, by the competency that could no longer be cleared, most frequent first. */
  residencyCompetencies: readonly Readonly<{ competency: string; count: number }>[]
  /** Last error of students that spent their attempts or could not be examined, most frequent first. */
  topErrors: readonly Readonly<{ error: string; count: number }>[]
}>

export type QuarantineSummary = Readonly<{
  total: number
  finalResults: number
  pendingCorrection: number
  byReason: Readonly<Record<QuarantineReason, number>>
  returnedToExam: Readonly<{ total: number; waitingForExam: number; passedExam: number; quarantinedAgain: number; other: number }>
  leftUniversity: LeftUniversitySummary
  /** Why students end up here, over everyone still in quarantine AND everyone who already left for it. */
  why: QuarantineWhy
}>

export function studentKey(candidateId: string, artifactHash: string): string {
  return `${candidateId}:${artifactHash.toLowerCase()}`
}

const emptyReasons = () => Object.fromEntries(QUARANTINE_REASONS.map(reason => [reason, 0])) as Record<QuarantineReason, number>

/** The dismissal record of a student the resolution removed from the University, if any. */
export function dismissalOf(student: Pick<QuarantineStudent, 'candidateId' | 'artifactHash'>, events: readonly RollingEvent[]): Readonly<{
  reason: QuarantineReason
  ours: boolean
  at: string | null
  lastError: string | null
  failedGates: readonly ExamGate[]
  failedCompetencies: readonly string[]
}> | null {
  const event = ownEvents(student, events)
    .filter(item => item.evidence?.profile === QUARANTINE_RESOLUTION_PROFILE && item.evidence?.claim === QUARANTINE_DISMISSED_CLAIM)
    .sort((a, b) => at(b.observedAt) - at(a.observedAt))[0]
  if (!event) return null
  const raw = String(event.evidence?.reason ?? '')
  const reason = (QUARANTINE_REASONS as readonly string[]).includes(raw) ? raw as QuarantineReason : 'no_recorded_reason'
  const gates = Array.isArray(event.evidence?.failedGates) ? (event.evidence!.failedGates as unknown[]).map(String) : []
  const competencies = Array.isArray(event.evidence?.failedCompetencies) ? (event.evidence!.failedCompetencies as unknown[]).map(item => String(item).slice(0, 80)) : []
  return Object.freeze({
    reason,
    ours: event.evidence?.ours === true,
    at: clean(event.observedAt, 40),
    lastError: clean(event.evidence?.lastError, 500),
    failedGates: Object.freeze(gates.filter((gate): gate is ExamGate => (EXAM_GATES as readonly string[]).includes(gate))),
    failedCompetencies: Object.freeze(competencies.filter(Boolean)),
  })
}

/**
 * The whole quarantine at once, what happened to every student returned to the exam, and who left the University
 * without graduating. `eventsFor` returns the assurance events of one candidate (any order).
 */
export function summarizeQuarantine(input: {
  students: readonly QuarantineStudent[]
  eventsFor: (candidateId: string) => readonly RollingEvent[]
  now: Date
}): Readonly<{ summary: QuarantineSummary; reasons: ReadonlyMap<string, QuarantineClassification> }> {
  const byReason = emptyReasons()
  const leftByReason = emptyReasons()
  const reasons = new Map<string, QuarantineClassification>()
  const returned = { total: 0, waitingForExam: 0, passedExam: 0, quarantinedAgain: 0, other: 0 }
  const examGates = Object.fromEntries(EXAM_GATES.map(gate => [gate, 0])) as Record<ExamGate, number>
  const competencies = new Map<string, number>()
  const errors = new Map<string, number>()
  const countWhy = (item: { reason: QuarantineReason; lastError: string | null; failedGates: readonly ExamGate[]; failedCompetencies: readonly string[] }) => {
    for (const gate of item.failedGates) examGates[gate] += 1
    for (const competency of item.failedCompetencies) competencies.set(competency, (competencies.get(competency) || 0) + 1)
    if (['exhausted_real_failures', 'exhausted_our_errors', 'exam_data_defect'].includes(item.reason)) {
      const code = errorCode(item.lastError)
      if (code) errors.set(code, (errors.get(code) || 0) + 1)
    }
  }

  for (const student of input.students) {
    const events = input.eventsFor(student.candidateId)
    if (student.status === 'quarantined') {
      const classification = classifyQuarantinedStudent({ student, events, now: input.now })
      byReason[classification.reason] += 1
      reasons.set(studentKey(student.candidateId, student.artifactHash), classification)
      countWhy(classification)
    } else if (student.status === 'retired') {
      const dismissal = dismissalOf(student, events)
      if (dismissal) {
        leftByReason[dismissal.reason] += 1
        countWhy(dismissal)
      }
    }

    const mine = ownEvents(student, events)
    const restoredAt = mine
      .filter(event => (event.evidence?.profile === QUARANTINE_REVIEW_PROFILE && event.evidence?.claim === QUARANTINE_RESTORED_CLAIM)
        || (event.evidence?.profile === QUARANTINE_RESOLUTION_PROFILE && event.evidence?.claim === QUARANTINE_RETURNED_CLAIM))
      .map(event => at(event.observedAt))
      .sort((a, b) => b - a)[0]
    if (restoredAt === undefined) continue
    returned.total += 1
    const passedAfter = mine.some(event => event.evidence?.claim === COMPLETED
      && event.evidence?.evaluationPassed === true
      && at(event.observedAt) >= restoredAt)
    if (passedAfter) returned.passedExam += 1
    else if (student.status === 'evaluation_pending') returned.waitingForExam += 1
    else if (student.status === 'quarantined') returned.quarantinedAgain += 1
    else returned.other += 1
  }

  const total = Object.values(byReason).reduce((sum, count) => sum + count, 0)
  const finalResults = FINAL_QUARANTINE_REASONS.reduce((sum, reason) => sum + byReason[reason], 0)
  return Object.freeze({
    summary: Object.freeze({
      total,
      finalResults,
      pendingCorrection: total - finalResults,
      byReason: Object.freeze(byReason),
      returnedToExam: Object.freeze(returned),
      leftUniversity: Object.freeze({
        total: Object.values(leftByReason).reduce((sum, count) => sum + count, 0),
        byReason: Object.freeze(leftByReason),
      }),
      why: Object.freeze({
        examGates: Object.freeze(examGates),
        residencyCompetencies: Object.freeze([...competencies.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 13)
          .map(([competency, count]) => Object.freeze({ competency, count }))),
        topErrors: Object.freeze([...errors.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 6)
          .map(([error, count]) => Object.freeze({ error, count }))),
      }),
    }),
    reasons,
  })
}

/** What happens next, in plain words, for the per-student table. */
export function quarantineNextAction(reason: QuarantineReason): string {
  switch (reason) {
    case 'exam_failed': return 'Leaves the University — exam FAIL on merit (final result)'
    case 'residency_failed': return 'Leaves the University — Residency FAIL (final result)'
    case 'exhausted_real_failures': return 'Leaves the University — three real exam failures (final result)'
    case 'exhausted_our_errors': return 'Returns to the exam (our errors, not the student)'
    case 'exam_data_defect': return 'Leaves the University — not examinable: its frozen exam data is broken (ours, not a FAIL)'
    default: return 'Returns to the exam once (no recorded reason); held for investigation if quarantined again'
  }
}
