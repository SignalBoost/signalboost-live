import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_UNIVERSITY_ACCEPTED_STUDY_PROOF_SOURCE = 'continuous_learning_accepted_gap' as const
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000

export type CosUniversityAcceptedStudyProofInput = Readonly<{
  planId: string
  evidenceRefs: readonly string[]
  /** Conservative causal boundary for these accepted refs: the governed learning cycle started here. */
  acceptedAt: string
}>

export type CosUniversityStudyProof = Readonly<{
  studyAttempt: number
  evidenceRefs: readonly string[]
  source: typeof COS_UNIVERSITY_ACCEPTED_STUDY_PROOF_SOURCE
  observedAt: string
  academicCredit: false
}>

type StudyPlanRow = {
  id: string
  attempt_count: number
  status: string
  last_attempt_at: string | null
  updated_at: string
  evidence: unknown
}

type AcceptedRefObservation = {
  ref: string
  acceptedAt: string
  acceptedAtMs: number
}

function clean(value: unknown, max = 500): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function evidenceRefs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => clean(item, 300)).filter(Boolean))]
}

function acceptedAtMs(value: unknown): number | null {
  const parsed = Date.parse(clean(value, 100))
  return Number.isFinite(parsed) ? parsed : null
}

export function readCosUniversityStudyProof(evidence: unknown): CosUniversityStudyProof | null {
  const proof = asRecord(asRecord(evidence).studyProof)
  const studyAttempt = Number(proof.studyAttempt)
  const refs = evidenceRefs(proof.evidenceRefs)
  const observedAt = clean(proof.observedAt, 100)
  if (!Number.isFinite(studyAttempt) || studyAttempt < 1 || !refs.length || !observedAt) return null
  if (proof.source !== COS_UNIVERSITY_ACCEPTED_STUDY_PROOF_SOURCE || proof.academicCredit !== false) return null
  return {
    studyAttempt: Math.floor(studyAttempt),
    evidenceRefs: refs,
    source: COS_UNIVERSITY_ACCEPTED_STUDY_PROOF_SOURCE,
    observedAt,
    academicCredit: false,
  }
}

export function cosUniversityStudyProofEligible(input: {
  attemptCount: number
  lastAttemptAt: string | null
  evidence: unknown
  now?: Date
}): boolean {
  const attemptCount = Math.floor(Number(input.attemptCount || 0))
  const lastAttemptMs = Date.parse(String(input.lastAttemptAt || ''))
  const proof = readCosUniversityStudyProof(input.evidence)
  if (!proof || attemptCount < 1 || proof.studyAttempt !== attemptCount || !Number.isFinite(lastAttemptMs)) return false
  const observedMs = Date.parse(proof.observedAt)
  const nowMs = (input.now instanceof Date ? input.now : new Date()).getTime()
  return Number.isFinite(observedMs)
    && observedMs <= nowMs + MAX_FUTURE_CLOCK_SKEW_MS
    && observedMs === lastAttemptMs
}

function remediationBoundaryMs(evidence: Record<string, unknown>, currentAttempt: number): number | null {
  const remediation = asRecord(evidence.practiceRemediation)
  if (remediation.requiresNewStudyAttempt !== true || Number(remediation.practiceRound) !== currentAttempt) return null
  const requestedAt = Date.parse(clean(remediation.requestedAt, 100))
  return Number.isFinite(requestedAt) ? requestedAt : Number.POSITIVE_INFINITY
}

/**
 * Advances a study plan only from accepted evidence that is causally newer than the plan's current
 * restudy boundary. `acceptedAt` is deliberately the learning-cycle start, not the later database
 * write time. Therefore a cycle that started before a terminal practice failure can never be
 * relabeled as post-failure learning merely because its proof writer runs after the failure.
 */
export async function recordAcceptedCosUniversityStudyAttempts(
  inputs: readonly CosUniversityAcceptedStudyProofInput[],
  now = new Date(),
): Promise<string[]> {
  const byPlan = new Map<string, Map<string, AcceptedRefObservation>>()
  const nowMs = now.getTime()
  for (const input of inputs) {
    const planId = clean(input.planId, 80)
    const timestamp = clean(input.acceptedAt, 100)
    const timestampMs = acceptedAtMs(timestamp)
    if (!planId || timestampMs === null || timestampMs > nowMs + MAX_FUTURE_CLOCK_SKEW_MS) continue
    const refs = evidenceRefs(input.evidenceRefs)
    if (!refs.length) continue
    const current = byPlan.get(planId) || new Map<string, AcceptedRefObservation>()
    for (const ref of refs) {
      const previous = current.get(ref)
      if (!previous || timestampMs > previous.acceptedAtMs) {
        current.set(ref, { ref, acceptedAt: timestamp, acceptedAtMs: timestampMs })
      }
    }
    byPlan.set(planId, current)
  }
  if (!byPlan.size) return []

  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_study_plans')
    .select('id,attempt_count,status,last_attempt_at,updated_at,evidence')
    .eq('agent_id', 'cos')
    .in('id', [...byPlan.keys()])
  if (result.error) throw result.error

  const writerNowIso = now.toISOString()
  const updatedPlanIds: string[] = []
  for (const row of (result.data || []) as StudyPlanRow[]) {
    if (row.status !== 'queued' && row.status !== 'studying') continue
    const currentAttempt = Math.max(0, Math.floor(Number(row.attempt_count || 0)))
    const evidence = asRecord(row.evidence)
    const boundaryMs = remediationBoundaryMs(evidence, currentAttempt)
    const accepted = [...(byPlan.get(row.id)?.values() || [])]
      .filter(observation => boundaryMs === null || observation.acceptedAtMs > boundaryMs)
      .sort((left, right) => left.acceptedAtMs - right.acceptedAtMs || left.ref.localeCompare(right.ref))
    if (!accepted.length) continue

    const evidenceRefsForProof = [...new Set(accepted.map(observation => observation.ref))]
    const proofObservedAt = accepted[accepted.length - 1].acceptedAt
    const nextAttempt = currentAttempt + 1
    const update = await db.from('cos_university_study_plans').update({
      status: 'studying',
      attempt_count: nextAttempt,
      last_attempt_at: proofObservedAt,
      evidence: {
        ...evidence,
        studyProof: {
          studyAttempt: nextAttempt,
          evidenceRefs: evidenceRefsForProof,
          source: COS_UNIVERSITY_ACCEPTED_STUDY_PROOF_SOURCE,
          observedAt: proofObservedAt,
          academicCredit: false,
        },
      },
      updated_at: writerNowIso,
    })
      .eq('id', row.id)
      .eq('attempt_count', currentAttempt)
      .eq('updated_at', row.updated_at)
      .in('status', ['queued', 'studying'])
      .select('id')
      .maybeSingle()
    if (update.error) throw update.error
    if (update.data?.id) updatedPlanIds.push(String(update.data.id))
  }
  return updatedPlanIds
}
