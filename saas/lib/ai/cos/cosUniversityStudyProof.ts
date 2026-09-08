import { cosServiceDb } from '@/lib/cos-core/storage/supabase'

export const COS_UNIVERSITY_ACCEPTED_STUDY_PROOF_SOURCE = 'continuous_learning_accepted_gap' as const
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60_000

export type CosUniversityAcceptedStudyProofInput = Readonly<{
  planId: string
  evidenceRefs: readonly string[]
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
  evidence: unknown
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

export async function recordAcceptedCosUniversityStudyAttempts(
  inputs: readonly CosUniversityAcceptedStudyProofInput[],
  now = new Date(),
): Promise<string[]> {
  const merged = new Map<string, Set<string>>()
  for (const input of inputs) {
    const planId = clean(input.planId, 80)
    if (!planId) continue
    const refs = evidenceRefs(input.evidenceRefs)
    if (!refs.length) continue
    const current = merged.get(planId) || new Set<string>()
    refs.forEach(ref => current.add(ref))
    merged.set(planId, current)
  }
  if (!merged.size) return []

  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_study_plans')
    .select('id,attempt_count,status,evidence')
    .eq('agent_id', 'cos')
    .in('id', [...merged.keys()])
  if (result.error) throw result.error

  const nowIso = now.toISOString()
  const updatedPlanIds: string[] = []
  for (const row of (result.data || []) as StudyPlanRow[]) {
    if (row.status !== 'queued' && row.status !== 'studying') continue
    const refs = [...(merged.get(row.id) || new Set<string>())]
    if (!refs.length) continue
    const currentAttempt = Math.max(0, Math.floor(Number(row.attempt_count || 0)))
    const nextAttempt = currentAttempt + 1
    const evidence = asRecord(row.evidence)
    const update = await db.from('cos_university_study_plans').update({
      status: 'studying',
      attempt_count: nextAttempt,
      last_attempt_at: nowIso,
      evidence: {
        ...evidence,
        studyProof: {
          studyAttempt: nextAttempt,
          evidenceRefs: refs,
          source: COS_UNIVERSITY_ACCEPTED_STUDY_PROOF_SOURCE,
          observedAt: nowIso,
          academicCredit: false,
        },
      },
      updated_at: nowIso,
    })
      .eq('id', row.id)
      .eq('attempt_count', currentAttempt)
      .in('status', ['queued', 'studying'])
      .select('id')
      .maybeSingle()
    if (update.error) throw update.error
    if (update.data?.id) updatedPlanIds.push(String(update.data.id))
  }
  return updatedPlanIds
}
