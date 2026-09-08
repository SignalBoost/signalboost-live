import { createHash } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { classifyCosUniversitySubjects } from './cosUniversity.ts'
import { isCosUniversityVerifiedProductionSource } from './cosUniversityARange.ts'
import {
  cosUniversityMastersTrackById,
  cosUniversityMastersTrackIdFromProgramKey,
  type CosUniversityMastersProgramId,
} from './cosUniversityMasters.ts'
import {
  readCosUniversityMastersRuntimeStatus,
  recordHostCosUniversityMastersEvidence,
} from './cosUniversityMastersRuntime.ts'

const AGENT_ID = 'cos'

type EnrollmentRow = { program_key: string; enrolled_at: string }
type OutcomeRow = {
  turn_id: string
  verified_success: boolean | null
  repair_needed: boolean | null
  escalated: boolean | null
  outcome_source: string | null
  outcome_at: string | null
}

export type CosUniversityMastersProductionSyncSummary = {
  enabled: boolean
  programId: CosUniversityMastersProgramId | null
  candidates: number
  matched: number
  recorded: number
  passed: number
  failed: number
  errors: string[]
  semantics: 'exact_turn_verified_production_only_program_core_subject_overlap'
}

function stableHash(...parts: unknown[]): string {
  return createHash('sha256').update(parts.map(part => String(part ?? '').trim()).join('|')).digest('hex')
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  try { return JSON.stringify(error).slice(0, 1200) } catch { return String(error) }
}

async function activeEnrollment(): Promise<{ programId: CosUniversityMastersProgramId; enrolledAt: string } | null> {
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_program_enrollments')
    .select('program_key,enrolled_at')
    .eq('agent_id', AGENT_ID)
    .eq('program_level', 'masters')
    .order('enrolled_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (result.error) throw result.error
  const row = (result.data || null) as EnrollmentRow | null
  if (!row) return null
  const programId = cosUniversityMastersTrackIdFromProgramKey(row.program_key)
  return programId ? { programId, enrolledAt: row.enrolled_at } : null
}

async function recentOutcomes(enrolledAt: string): Promise<OutcomeRow[]> {
  const db = cosServiceDb()
  if (!db) return []
  const result = await db.from('cos_turn_outcomes')
    .select('turn_id,verified_success,repair_needed,escalated,outcome_source,outcome_at')
    .like('outcome_source', 'production_verified:%')
    .gte('outcome_at', enrolledAt)
    .order('outcome_at', { ascending: false })
    .limit(1000)
  if (result.error) throw result.error
  return ((result.data || []) as OutcomeRow[]).slice().reverse()
}

async function problemClass(turnId: string): Promise<string> {
  const db = cosServiceDb()
  if (!db) return ''
  const result = await db.from('cos_turn_experience').select('problem_class').eq('turn_id', turnId).maybeSingle()
  if (result.error) throw result.error
  return String(result.data?.problem_class || '')
}

export async function syncCosUniversityMastersProductionEvidence(): Promise<CosUniversityMastersProductionSyncSummary> {
  const summary: CosUniversityMastersProductionSyncSummary = {
    enabled: process.env.COS_UNIVERSITY_MASTERS_EXAMS_ENABLED === 'true',
    programId: null,
    candidates: 0,
    matched: 0,
    recorded: 0,
    passed: 0,
    failed: 0,
    errors: [],
    semantics: 'exact_turn_verified_production_only_program_core_subject_overlap',
  }
  if (!summary.enabled) return summary

  try {
    const active = await activeEnrollment()
    if (!active) return summary
    summary.programId = active.programId
    const runtime = await readCosUniversityMastersRuntimeStatus(active.programId)
    if (!runtime.enrollment || runtime.credential || runtime.timingStatus === 'deadline_expired' || runtime.timingStatus === 'not_enrolled') return summary
    const track = cosUniversityMastersTrackById(active.programId)
    if (!track) return summary
    const core = new Set(track.coreSubjects)
    const outcomes = await recentOutcomes(active.enrolledAt)
    summary.candidates = outcomes.length

    for (const outcome of outcomes) {
      const source = String(outcome.outcome_source || '').trim()
      const observedAt = new Date(String(outcome.outcome_at || ''))
      if (outcome.verified_success === null || !Number.isFinite(observedAt.getTime()) || !isCosUniversityVerifiedProductionSource(source)) continue
      const classification = classifyCosUniversitySubjects(await problemClass(outcome.turn_id))
      const matchedSubjects = classification.filter(subjectId => core.has(subjectId))
      if (!matchedSubjects.length) continue
      summary.matched += 1
      const variantHash = stableHash(active.programId, outcome.turn_id, source, observedAt.toISOString(), matchedSubjects.join(','))
      const recorded = await recordHostCosUniversityMastersEvidence({
        programId: active.programId,
        evidenceKey: `masters-production:${active.programId}:${outcome.turn_id}:${observedAt.toISOString()}`,
        stage: 'verified_practical_work',
        passed: outcome.verified_success === true,
        variantHash,
        authority: 'verified_production',
        sourceRef: source,
        observedAt,
        validityDays: 120,
        evidenceSnapshot: {
          turnId: outcome.turn_id,
          matchedCoreSubjects: matchedSubjects,
          repairNeeded: outcome.repair_needed,
          escalated: outcome.escalated,
        },
      })
      if (!recorded) continue
      summary.recorded += 1
      if (outcome.verified_success) summary.passed += 1
      else summary.failed += 1
    }
    return summary
  } catch (error) {
    summary.errors.push(describeError(error))
    return summary
  }
}
