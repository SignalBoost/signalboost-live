// Pure policy for owner-verified real-world outcomes of COS answers. No I/O, testable in isolation.
//
// Why this exists: grade A in any University subject requires a verified Production transfer, and the
// only verified source was Builder jobs (Software Specialist, Computer Science). COS answers about
// politics, history, quantum computing, law and the rest had no way to become verified evidence, and the
// existing bridge labelled turns by problem_class, which collapses a politics or history question into
// "general reasoning". This policy records WHAT the owner verified and WHICH subjects the actual user
// request belongs to, classified from the request text itself.

import { COS_UNIVERSITY_SUBJECTS, classifyCosUniversitySubjects, type CosUniversitySubjectId } from './cosUniversity.ts'

export const COS_OWNER_VERIFIED_SUBJECTS_PROFILE = 'cos_owner_verified_turn_subjects_v1' as const
export const COS_OWNER_VERIFIED_OUTCOME_MAX_AGE_DAYS = 30
export const COS_OWNER_VERIFIED_MAX_SUBJECTS = 4

const VALID_SUBJECTS = new Set<string>(COS_UNIVERSITY_SUBJECTS.map(subject => subject.id))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const MODEL_SOURCE = /^(?:model|council|llm|consensus|frontier_teacher|cos|assistant)\s*:/i

export type OwnerVerifiedOutcomeRequest = Readonly<{
  turnId: string
  outcome: 'success' | 'failure'
  evidenceRef: string
  summary: string
}>

export type OwnerVerifiedOutcomeDecision =
  | Readonly<{ ok: true; turnId: string; outcome: 'success' | 'failure'; evidenceRef: string; summary: string; subjects: CosUniversitySubjectId[] }>
  | Readonly<{ ok: false; error: string }>

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Subjects come from the user's own request text, never from the reply COS wrote about itself. */
export function subjectsForVerifiedRequest(userPrompt: string): CosUniversitySubjectId[] {
  return classifyCosUniversitySubjects(userPrompt).slice(0, COS_OWNER_VERIFIED_MAX_SUBJECTS)
}

export function decideOwnerVerifiedOutcome(input: {
  request: Partial<OwnerVerifiedOutcomeRequest>
  turn: { exists: boolean; userPrompt: string; answeredAt: string } | null
  alreadyVerified: boolean
  now: Date
}): OwnerVerifiedOutcomeDecision {
  const turnId = clean(input.request.turnId, 80)
  if (!UUID.test(turnId)) return { ok: false, error: 'turn_id_invalid' }
  const outcome = input.request.outcome
  if (outcome !== 'success' && outcome !== 'failure') return { ok: false, error: 'outcome_invalid' }
  const evidenceRef = clean(input.request.evidenceRef, 1000)
  if (evidenceRef.length < 8) return { ok: false, error: 'evidence_reference_required' }
  if (MODEL_SOURCE.test(evidenceRef)) return { ok: false, error: 'evidence_reference_cannot_be_model_output' }
  const summary = clean(input.request.summary, 2000)
  if (summary.length < 20) return { ok: false, error: 'outcome_summary_required' }

  if (!input.turn?.exists) return { ok: false, error: 'turn_not_owned_or_not_found' }
  if (input.alreadyVerified) return { ok: false, error: 'turn_outcome_already_verified' }
  const answeredMs = Date.parse(input.turn.answeredAt)
  if (!Number.isFinite(answeredMs) || answeredMs > input.now.getTime()) return { ok: false, error: 'turn_time_invalid' }
  if (input.now.getTime() - answeredMs > COS_OWNER_VERIFIED_OUTCOME_MAX_AGE_DAYS * 86_400_000) {
    return { ok: false, error: 'turn_too_old_to_verify' }
  }
  const subjects = subjectsForVerifiedRequest(input.turn.userPrompt)
  if (!subjects.length) return { ok: false, error: 'request_matches_no_university_subject' }
  return { ok: true, turnId, outcome, evidenceRef, summary, subjects }
}

/** Subjects recorded at verification time for a turn, read back by the A-range Production bridge. */
export function verifiedTurnSubjectsFromLedger(rows: readonly { evidence: Record<string, unknown> | null }[], turnId: string): CosUniversitySubjectId[] | null {
  const row = rows.find(item => item?.evidence?.profile === COS_OWNER_VERIFIED_SUBJECTS_PROFILE && item?.evidence?.turnId === turnId)
  if (!row) return null
  const raw = row.evidence?.subjects
  if (!Array.isArray(raw)) return null
  const subjects = raw.map(value => String(value)).filter(value => VALID_SUBJECTS.has(value)) as CosUniversitySubjectId[]
  return subjects.length ? subjects.slice(0, COS_OWNER_VERIFIED_MAX_SUBJECTS) : null
}
