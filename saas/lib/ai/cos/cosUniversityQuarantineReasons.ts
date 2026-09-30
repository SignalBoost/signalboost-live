// saas/lib/ai/cos/cosUniversityQuarantineReasons.ts
//
// Owner direction 2026-09-30: deal with the students in quarantine. "Quarantined" on its own says nothing. A student
// is there because it sat the exam and failed on merit, because its Residency ended in a FAIL, because it spent its
// three real exam attempts, because OUR infrastructure failures were once counted against it (the quarantine review
// returns those to the exam), or because its frozen exam data is broken (ours: it was never examined, so it is not a
// FAIL). This names the reason for every quarantined student from the durable assurance events, so the owner sees
// results and pending corrections instead of one number.
//
// Pure and read-only: it decides nothing, grants nothing and never changes a status. A FAIL stays a FAIL; the
// standard is never lowered to turn a result into a pass.

import {
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

const COMPLETED = 'mass_distilled_independent_evaluation_completed'
const FAILED = 'mass_distilled_independent_evaluation_failed'
const EXHAUSTED = 'mass_distilled_evaluation_attempts_exhausted'
const RESIDENCY_FAILED = 'builder_residency_failed'

export type QuarantineStudent = Readonly<{
  candidateId: string
  subjectId: string
  artifactHash: string
  createdAt: string
  status: string
  residencyStanding?: string | null
  /** Latest independent evaluation row for this exact artifact, when the lane recorded one. */
  evaluation?: Readonly<{ passed: boolean; observedAt: string | null }> | null
}>

export type QuarantineClassification = Readonly<{
  reason: QuarantineReason
  final: boolean
  since: string | null
  lastError: string | null
}>

type Disposition = { reason: QuarantineReason | 'exhausted'; at: number; since: string | null; error: string | null }

const at = (value: unknown) => {
  const parsed = Date.parse(String(value ?? ''))
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY
}
const clean = (value: unknown, max = 300) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return text || null
}

function ownEvents(student: QuarantineStudent, events: readonly RollingEvent[]): RollingEvent[] {
  const hash = student.artifactHash.toLowerCase()
  return events.filter(event => event.candidateId === student.candidateId
    && String(event.evidence?.artifactHash ?? '').toLowerCase() === hash)
}

/**
 * Why this quarantined student is in quarantine. The most recent recorded disposition wins, because a student
 * returned to the exam by the review and quarantined again carries the newer result.
 */
export function classifyQuarantinedStudent(input: {
  student: QuarantineStudent
  events: readonly RollingEvent[]
  now: Date
}): QuarantineClassification {
  const { student } = input
  const mine = ownEvents(student, input.events)
  const dispositions: Disposition[] = []
  for (const event of mine) {
    const claim = event.evidence?.claim
    const observed = at(event.observedAt)
    const since = clean(event.observedAt, 40)
    if (claim === RESIDENCY_FAILED) {
      dispositions.push({ reason: 'residency_failed', at: observed, since, error: null })
    } else if (claim === COMPLETED && event.evidence?.evaluationPassed === false) {
      dispositions.push({ reason: 'exam_failed', at: observed, since, error: null })
    } else if (claim === EXHAUSTED) {
      dispositions.push({ reason: 'exhausted', at: observed, since, error: clean(event.evidence?.lastError, 500) })
    } else if (claim === FAILED
      && (event.evidence?.terminalDataDefect === true || isTerminalHoldoutDataDefect(event.evidence?.error))) {
      dispositions.push({ reason: 'exam_data_defect', at: observed, since, error: clean(event.evidence?.error, 500) })
    }
  }
  if (student.evaluation && student.evaluation.passed === false) {
    dispositions.push({ reason: 'exam_failed', at: at(student.evaluation.observedAt), since: clean(student.evaluation.observedAt, 40), error: null })
  }
  if (!dispositions.length && student.residencyStanding === 'residency_failed') {
    dispositions.push({ reason: 'residency_failed', at: Number.NEGATIVE_INFINITY, since: null, error: null })
  }
  const latest = [...dispositions].sort((a, b) => b.at - a.at)[0]
  if (!latest) return Object.freeze({ reason: 'no_recorded_reason', final: false, since: null, lastError: null })

  let reason: QuarantineReason
  let lastError = latest.error
  if (latest.reason === 'exhausted') {
    // Same counter the exhaustion sweep and the quarantine review use, so the three can never disagree.
    const ours = decideWronglyExhaustedMassEvaluationArtifacts({
      artifacts: [{ candidateId: student.candidateId, subjectId: student.subjectId, artifactHash: student.artifactHash, createdAt: student.createdAt }],
      events: mine,
      now: input.now,
    })
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
  return Object.freeze({
    reason,
    final: FINAL_QUARANTINE_REASONS.includes(reason),
    since: latest.since,
    lastError,
  })
}

export type QuarantineSummary = Readonly<{
  total: number
  finalResults: number
  pendingCorrection: number
  byReason: Readonly<Record<QuarantineReason, number>>
  returnedToExam: Readonly<{ total: number; waitingForExam: number; passedExam: number; quarantinedAgain: number; other: number }>
}>

export function studentKey(candidateId: string, artifactHash: string): string {
  return `${candidateId}:${artifactHash.toLowerCase()}`
}

/**
 * The whole quarantine at once, plus what happened to every student the review returned to the exam.
 * `eventsFor` returns the assurance events of one candidate (any order).
 */
export function summarizeQuarantine(input: {
  students: readonly QuarantineStudent[]
  eventsFor: (candidateId: string) => readonly RollingEvent[]
  now: Date
}): Readonly<{ summary: QuarantineSummary; reasons: ReadonlyMap<string, QuarantineClassification> }> {
  const byReason = Object.fromEntries(QUARANTINE_REASONS.map(reason => [reason, 0])) as Record<QuarantineReason, number>
  const reasons = new Map<string, QuarantineClassification>()
  const returned = { total: 0, waitingForExam: 0, passedExam: 0, quarantinedAgain: 0, other: 0 }

  for (const student of input.students) {
    const events = input.eventsFor(student.candidateId)
    if (student.status === 'quarantined') {
      const classification = classifyQuarantinedStudent({ student, events, now: input.now })
      byReason[classification.reason] += 1
      reasons.set(studentKey(student.candidateId, student.artifactHash), classification)
    }

    const mine = ownEvents(student, events)
    const restoredAt = mine
      .filter(event => event.evidence?.profile === QUARANTINE_REVIEW_PROFILE && event.evidence?.claim === QUARANTINE_RESTORED_CLAIM)
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
    }),
    reasons,
  })
}

/** What happens next, in plain words, for the per-student table. */
export function quarantineNextAction(reason: QuarantineReason): string {
  switch (reason) {
    case 'exam_failed': return 'None — exam FAIL on merit (final result)'
    case 'residency_failed': return 'None — Residency FAIL (final result)'
    case 'exhausted_real_failures': return 'None — three real exam failures (final result)'
    case 'exhausted_our_errors': return 'Returns to the exam at the next quarantine review (our errors, not the student)'
    case 'exam_data_defect': return 'Not examinable: its frozen exam data is broken (ours, not a FAIL)'
    default: return 'No disposition recorded — investigate'
  }
}
