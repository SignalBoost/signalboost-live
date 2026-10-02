// saas/lib/ai/cos/cosUniversityQuarantineResolution.ts
// Owner direction 2026-09-30: "what is the reason of quarantine forever ... if they are there because of our
// infrastructure fix it - if because they are incompetent delete them." Quarantine is a short stop, not a place to live.
// Every 15 minutes (the backlog-compact cron, right after the quarantine review) each quarantined student gets the
// decision its recorded reason calls for:
//
//   exam FAIL on merit / Residency FAIL / three real exam failures  -> leaves the University (status `retired`)
//   our errors counted against it                                   -> the quarantine review returns it to the exam
//   frozen exam data broken (ours)                                  -> leaves the University, recorded as OURS
//   no recorded reason                                              -> returned to the exam ONCE; the exam decides
//
// "Delete" is a status, not a wipe: the student leaves every University count and queue, and the terminal-endpoint GC
// then deletes its RunPod endpoint (no cost, no worker quota). The trained weights, exam scores and this dismissal
// record stay as the proof of the result, and the failure-derived curriculum keeps learning from them. The standard is
// unchanged: nothing here turns a FAIL into a pass, and a student returned to the exam still has to pass it.

import { createHash } from 'node:crypto'
import type { RollingEvent } from './cosUniversityMassEvaluationRollingAuthority.ts'
import { MASS_XSA_EXAMS_PAUSED, xsaExamPaused } from './cosUniversityXsaExamPause.ts'
import {
  QUARANTINE_DISMISSED_CLAIM,
  QUARANTINE_RESOLUTION_PROFILE,
  QUARANTINE_RETURNED_CLAIM,
  classifyQuarantinedStudent,
  type ExamGate,
  type QuarantineClassification,
  type QuarantineReason,
  type QuarantineStudent,
} from './cosUniversityQuarantineReasons.ts'

export const QUARANTINE_RESOLUTION_MAX_PER_RUN = 100

/**
 * Production 2026-10-02: eleven students sat in quarantine for DAYS. Two of this module's own outcomes never change a
 * status, so they were parking lots, exactly what the owner's rule forbids:
 *
 *   `leave_for_review` defers to the quarantine review, but that review skips any artifact where
 *   `history.hasVerdict || history.liveStart`. A student whose attempts were exhausted by OUR errors AND which already
 *   carries a verdict is therefore refused by the review and left alone by the resolution. Closed loop, no exit.
 *
 *   `hold_for_investigation` is deliberately terminal for a student with no recorded reason that was already returned
 *   to the exam once. "Visible instead of looping" was right; staying forever was not.
 *
 * Both are `ours: true` and neither is a FAIL, so the owner's own rule already decides them: our fault, so the student
 * leaves rather than waits. They keep their normal outcome for this long so the review and a human still get first
 * refusal; past it, the stall itself is the finding and the student is dismissed as OURS. No FAIL is created, no
 * standard is lowered, and nothing here turns a FAIL into a pass.
 */
export const QUARANTINE_STALL_LIMIT_MS = 6 * 60 * 60 * 1000

const PAGE_SIZE = 500
const CANDIDATE_CHUNK = 75
const EVENT_PAGE_SIZE = 1000
const MAX_EVENT_PAGES = 20

export type QuarantineAction = 'dismiss' | 'return_to_exam' | 'leave_for_review' | 'hold_for_investigation'

export type QuarantineDecision = Readonly<{
  action: QuarantineAction
  reason: QuarantineReason
  /** True when the student is not at fault (our infrastructure or our exam data). */
  ours: boolean
}>

/**
 * Pure: what the owner's rule says for one classified student. `alreadyReturned` is true when this exact student was
 * returned to the exam once before by this resolution; a second quarantine with no recorded reason is our defect to
 * investigate, never evidence that the student is incompetent, so it is held (visible) instead of looping.
 */
export function decideQuarantineResolution(input: {
  classification: QuarantineClassification
  candidateId: string
  alreadyReturned: boolean
  /** How long this student has already been quarantined. Omitted/unknown is treated as not yet stalled. */
  quarantinedForMs?: number
}): QuarantineDecision {
  const { reason } = input.classification
  if (reason === 'exam_failed' || reason === 'residency_failed' || reason === 'exhausted_real_failures') {
    return Object.freeze({ action: 'dismiss', reason, ours: false })
  }
  if (reason === 'exam_data_defect') return Object.freeze({ action: 'dismiss', reason, ours: true })

  // One governed retry is the investigation. If the same artifact returns to quarantine again, do not
  // wait on updated_at: the quarantine -> exam -> quarantine lap rewinds that clock and would park it forever.
  if (input.alreadyReturned) return Object.freeze({ action: 'dismiss', reason, ours: true })

  const waited = Number(input.quarantinedForMs)
  const stalled = Number.isFinite(waited) && waited >= QUARANTINE_STALL_LIMIT_MS

  if (reason === 'exhausted_our_errors') {
    // The review gets first refusal. Once the student has waited past the limit, the review has demonstrably
    // declined it every run in between, so waiting again changes nothing: it leaves as OURS.
    return Object.freeze({ action: stalled ? 'dismiss' : 'leave_for_review', reason, ours: true })
  }
  // no_recorded_reason: only the mass lane's exam can be re-armed automatically.
  if (!input.candidateId.startsWith('mass:') || input.alreadyReturned) {
    return Object.freeze({ action: stalled ? 'dismiss' : 'hold_for_investigation', reason, ours: true })
  }
  return Object.freeze({ action: 'return_to_exam', reason, ours: true })
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const text = (value: unknown, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
const HEX64 = /^[a-f0-9]{64}$/i

export function chunks<T>(items: readonly T[], size = CANDIDATE_CHUNK): T[][] {
  const out: T[][] = []
  for (let offset = 0; offset < items.length; offset += size) out.push(items.slice(offset, offset + size))
  return out
}

function failedGatesFromRow(row: any): ExamGate[] {
  const gates: ExamGate[] = []
  if (row?.holdout_improved !== true) gates.push('holdout')
  if (row?.safety_passed !== true) gates.push('safety')
  if (row?.unseen_transfer_passed !== true) gates.push('transfer')
  if (row?.delayed_retention_passed !== true) gates.push('retention')
  return gates
}

export type QuarantineResolutionResult = Readonly<{
  quarantined: number
  dismissed: number
  returnedToExam: number
  leftForReview: number
  heldForInvestigation: number
  remaining: number
  byReason: Readonly<Record<string, number>>
}>

/** Reads the quarantine, decides per student, and applies at most QUARANTINE_RESOLUTION_MAX_PER_RUN changes. */
export async function resolveQuarantine(input: { db: any; now?: Date }): Promise<QuarantineResolutionResult> {
  const db = input.db
  if (!db) throw new Error('service_database_unavailable')
  const now = input.now ?? new Date()

  const quarantined: any[] = []
  for (let from = 0; from < PAGE_SIZE * 40; from += PAGE_SIZE) {
    const page = await db.from('cos_local_distillation_artifacts')
      // updated_at is how long the student has been sitting here, which is what decides a stalled outcome.
      .select('candidate_id,subject_id,trained_artifact_hash,created_at,updated_at,status')
      .eq('status', 'quarantined')
      .order('updated_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (page.error) throw page.error
    quarantined.push(...(page.data || []))
    if ((page.data || []).length < PAGE_SIZE) break
  }
  const students = quarantined
    .map(row => ({
      candidateId: text(row.candidate_id, 240),
      subjectId: text(row.subject_id, 240),
      artifactHash: text(row.trained_artifact_hash, 80).toLowerCase(),
      createdAt: text(row.created_at, 40),
      updatedAt: text(row.updated_at, 40),
      status: 'quarantined',
    }))
    .filter(row => row.candidateId && HEX64.test(row.artifactHash))
  const byReason: Record<string, number> = {}
  const empty = { quarantined: students.length, dismissed: 0, returnedToExam: 0, leftForReview: 0, heldForInvestigation: 0 }
  if (!students.length) return Object.freeze({ ...empty, remaining: 0, byReason: Object.freeze(byReason) })

  const candidateIds = [...new Set(students.map(row => row.candidateId))]
  const eventsByCandidate = new Map<string, RollingEvent[]>()
  const evaluationByKey = new Map<string, any>()
  const residencyByKey = new Map<string, string>()
  for (const chunk of chunks(candidateIds)) {
    for (let from = 0; from < EVENT_PAGE_SIZE * MAX_EVENT_PAGES; from += EVENT_PAGE_SIZE) {
      const page = await db.from('cos_university_learning_assurance_events')
        .select('candidate_id,observed_at,expires_at,verifier,evidence')
        .eq('event_type', 'fine_tune')
        .in('candidate_id', chunk)
        .order('observed_at', { ascending: true })
        .range(from, from + EVENT_PAGE_SIZE - 1)
      if (page.error) throw page.error
      for (const row of page.data || []) {
        const candidateId = text(row.candidate_id, 240)
        const list = eventsByCandidate.get(candidateId) || []
        list.push(Object.freeze({
          candidateId,
          observedAt: String(row.observed_at || ''),
          expiresAt: row.expires_at == null ? null : String(row.expires_at),
          verifier: String(row.verifier || ''),
          evidence: row.evidence && typeof row.evidence === 'object' && !Array.isArray(row.evidence) ? row.evidence : null,
        }))
        eventsByCandidate.set(candidateId, list)
      }
      if ((page.data || []).length < EVENT_PAGE_SIZE) break
    }
    const evaluations = await db.from('cos_university_distilled_evaluation_runs')
      .select('candidate_id,trained_artifact_hash,holdout_improved,safety_passed,unseen_transfer_passed,delayed_retention_passed,created_at')
      .in('candidate_id', chunk)
      .order('created_at', { ascending: false })
      .limit(1000)
    if (evaluations.error) throw evaluations.error
    for (const row of evaluations.data || []) {
      const key = `${text(row.candidate_id, 240)}:${text(row.trained_artifact_hash, 80).toLowerCase()}`
      if (!evaluationByKey.has(key)) evaluationByKey.set(key, row)
    }
    const residency = await db.from('cos_university_residency_enrollments')
      .select('candidate_id,trained_artifact_hash,standing')
      .in('candidate_id', chunk)
      .limit(1000)
    if (residency.error) throw residency.error
    for (const row of residency.data || []) {
      residencyByKey.set(`${text(row.candidate_id, 240)}:${text(row.trained_artifact_hash, 80).toLowerCase()}`, text(row.standing, 80))
    }
  }

  let applied = 0
  let dismissed = 0
  let returnedToExam = 0
  let leftForReview = 0
  let heldForInvestigation = 0
  for (const student of students) {
    const key = `${student.candidateId}:${student.artifactHash}`
    const events = eventsByCandidate.get(student.candidateId) || []
    const evaluationRow = evaluationByKey.get(key)
    const { updatedAt, ...studentFields } = student
    const quarantinedSince = Date.parse(updatedAt || student.createdAt || '')
    const quarantinedForMs = Number.isFinite(quarantinedSince)
      ? Math.max(0, now.getTime() - quarantinedSince)
      : 0
    const full: QuarantineStudent = {
      ...studentFields,
      residencyStanding: residencyByKey.get(key) || null,
      evaluation: evaluationRow ? {
        passed: failedGatesFromRow(evaluationRow).length === 0,
        observedAt: text(evaluationRow.created_at, 40) || null,
        failedGates: failedGatesFromRow(evaluationRow),
      } : null,
    }
    const classification = classifyQuarantinedStudent({ student: full, events, now })
    const alreadyReturned = events.some(event => event.evidence?.profile === QUARANTINE_RESOLUTION_PROFILE
      && event.evidence?.claim === QUARANTINE_RETURNED_CLAIM
      && String(event.evidence?.artifactHash || '').toLowerCase() === student.artifactHash)
    const decision = decideQuarantineResolution({
      classification,
      candidateId: student.candidateId,
      alreadyReturned,
      quarantinedForMs,
    })
    byReason[decision.reason] = (byReason[decision.reason] || 0) + 1

    if (decision.action === 'leave_for_review') { leftForReview += 1; continue }
    if (decision.action === 'hold_for_investigation') { heldForInvestigation += 1; continue }
    if (applied >= QUARANTINE_RESOLUTION_MAX_PER_RUN) continue

    const nextStatus = decision.action === 'dismiss' ? 'retired' : (student.candidateId.startsWith('mass:') ? 'evaluation_ready' : 'evaluation_pending')
    const at = new Date().toISOString()
    // Conditional on the exact student still being quarantined: a retry or a concurrent run changes nothing twice.
    const updated = await db.from('cos_local_distillation_artifacts')
      .update({ status: nextStatus, updated_at: at })
      .eq('candidate_id', student.candidateId)
      .eq('trained_artifact_hash', student.artifactHash)
      .eq('status', 'quarantined')
      .select('id')
    if (updated.error) {
      console.warn('[cos-university-quarantine-resolution] transition rejected; continuing', { candidateId: student.candidateId, error: text(updated.error?.message || updated.error, 300) })
      continue
    }
    if (!(updated.data || []).length) continue
    applied += 1

    const claim = decision.action === 'dismiss' ? QUARANTINE_DISMISSED_CLAIM : QUARANTINE_RETURNED_CLAIM
    const body = {
      profile: QUARANTINE_RESOLUTION_PROFILE,
      claim,
      candidateId: student.candidateId,
      artifactHash: student.artifactHash,
      reason: decision.reason,
      ours: decision.ours,
      failedGates: classification.failedGates,
      failedCompetencies: classification.failedCompetencies,
      lastError: classification.lastError,
      dispositionAt: classification.since,
      previousStatus: 'quarantined',
      nextStatus,
      // Auditable: how long it waited, and whether the stall limit rather than its reason decided the outcome.
      quarantinedForMs,
      stalledPastLimit: quarantinedForMs >= QUARANTINE_STALL_LIMIT_MS,
      ownerDirection: quarantinedForMs >= QUARANTINE_STALL_LIMIT_MS && decision.ours
        ? 'owner_explicit_direction_2026-10-02_quarantine_is_not_a_parking_lot'
        : 'owner_explicit_direction_2026-09-30_resolve_quarantine',
      evaluationPassed: false,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
    }
    const event = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: hash([QUARANTINE_RESOLUTION_PROFILE, claim, student.candidateId, student.artifactHash]),
      event_type: 'fine_tune',
      subject_id: student.subjectId || null,
      candidate_id: student.candidateId,
      evidence_hash: hash(body),
      evidence: body,
      verifier: 'host_controller',
      observed_at: at,
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (event.error) throw event.error
    if (decision.action === 'dismiss') dismissed += 1
    else returnedToExam += 1
  }

  return Object.freeze({
    quarantined: students.length,
    dismissed,
    returnedToExam,
    leftForReview,
    heldForInvestigation,
    remaining: students.length - dismissed - returnedToExam,
    byReason: Object.freeze(byReason),
  })
}

const ACTIVE_RESIDENCY_STANDINGS = ['resident', 'senior_resident', 'remediation_required']

export type XsaRemovalResult = Readonly<{ paused: boolean; checked: number; removed: number; keptInResidency: number }>

/**
 * Owner direction 2026-09-30 ("remove them"): students trained with Exclusive Self Attention (XSA) cannot be examined
 * while their exams are paused (our XSA server answers in 37-44s, the exam limit is 50s, and XSA training is stopped).
 * They leave the University as OUR failure, never as a FAIL: status `retired` with a dismissal record that says so.
 * The weights stay as the record if XSA is ever tested again on a fast server. Runs only while the pause is on, so
 * unpausing XSA exams stops it; a student still inside an active Residency is left alone.
 */
export async function retireUnexaminableXsaStudents(input: { db: any; now?: Date }): Promise<XsaRemovalResult> {
  const db = input.db
  if (!db) throw new Error('service_database_unavailable')
  if (!MASS_XSA_EXAMS_PAUSED) return Object.freeze({ paused: false, checked: 0, removed: 0, keptInResidency: 0 })

  const pending: any[] = []
  for (let from = 0; from < PAGE_SIZE * 40; from += PAGE_SIZE) {
    const page = await db.from('cos_local_distillation_artifacts')
      .select('candidate_id,subject_id,trained_artifact_hash,intended_use,status')
      .eq('status', 'evaluation_pending')
      .order('updated_at', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (page.error) throw page.error
    pending.push(...(page.data || []))
    if ((page.data || []).length < PAGE_SIZE) break
  }
  const xsa = pending
    .filter(row => text(row.candidate_id, 240).startsWith('mass:'))
    .filter(row => {
      const receipt = row?.intended_use?.trainingReceipt
      return xsaExamPaused({ xsa: Boolean(receipt && typeof receipt === 'object' && receipt.xsaTrainingApplied === true) })
    })
    .map(row => ({
      candidateId: text(row.candidate_id, 240),
      subjectId: text(row.subject_id, 240),
      artifactHash: text(row.trained_artifact_hash, 80).toLowerCase(),
    }))
    .filter(row => HEX64.test(row.artifactHash))
  if (!xsa.length) return Object.freeze({ paused: true, checked: 0, removed: 0, keptInResidency: 0 })

  const inResidency = new Set<string>()
  for (const chunk of chunks([...new Set(xsa.map(row => row.candidateId))])) {
    const residency = await db.from('cos_university_residency_enrollments')
      .select('candidate_id,trained_artifact_hash,standing')
      .in('candidate_id', chunk)
      .limit(1000)
    if (residency.error) throw residency.error
    for (const row of residency.data || []) {
      if (ACTIVE_RESIDENCY_STANDINGS.includes(text(row.standing, 80))) {
        inResidency.add(`${text(row.candidate_id, 240)}:${text(row.trained_artifact_hash, 80).toLowerCase()}`)
      }
    }
  }

  let removed = 0
  let keptInResidency = 0
  for (const student of xsa) {
    if (inResidency.has(`${student.candidateId}:${student.artifactHash}`)) { keptInResidency += 1; continue }
    if (removed >= QUARANTINE_RESOLUTION_MAX_PER_RUN) break
    const at = new Date().toISOString()
    // Conditional on the exact student still waiting for its exam: a retry or a concurrent run changes nothing twice.
    const updated = await db.from('cos_local_distillation_artifacts')
      .update({ status: 'retired', updated_at: at })
      .eq('candidate_id', student.candidateId)
      .eq('trained_artifact_hash', student.artifactHash)
      .eq('status', 'evaluation_pending')
      .select('id')
    if (updated.error) throw updated.error
    if (!(updated.data || []).length) continue
    const body = {
      profile: QUARANTINE_RESOLUTION_PROFILE,
      claim: QUARANTINE_DISMISSED_CLAIM,
      candidateId: student.candidateId,
      artifactHash: student.artifactHash,
      reason: 'xsa_not_examinable',
      ours: true,
      failedGates: [],
      failedCompetencies: [],
      lastError: 'xsa_exam_paused: our XSA server answers too slowly for the exam per-answer limit',
      previousStatus: 'evaluation_pending',
      nextStatus: 'retired',
      ownerDirection: 'owner_explicit_direction_2026-09-30_remove_xsa_students',
      evaluationPassed: false,
      productionTrafficAuthorized: false,
      authorityExpanded: false,
    }
    const event = await db.from('cos_university_learning_assurance_events').upsert({
      event_key: hash([QUARANTINE_RESOLUTION_PROFILE, QUARANTINE_DISMISSED_CLAIM, 'xsa', student.candidateId, student.artifactHash]),
      event_type: 'fine_tune',
      subject_id: student.subjectId || null,
      candidate_id: student.candidateId,
      evidence_hash: hash(body),
      evidence: body,
      verifier: 'host_controller',
      observed_at: at,
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    if (event.error) throw event.error
    removed += 1
  }
  return Object.freeze({ paused: true, checked: xsa.length, removed, keptInResidency })
}