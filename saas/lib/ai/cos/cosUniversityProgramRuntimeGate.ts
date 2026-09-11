//
// Service-side execution gate shared by every scheduled University academic worker lane.
//
// It resolves the agent's CURRENT academic program across every level rather than a single
// hard-coded undergraduate cohort. A program whose credential has been issued is finished and
// stops its own lanes; a program past its hard deadline stops too. Lanes resume when the
// admission authority opens a new program under a new immutable key.

import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  evaluateCosUniversityActiveAcademicLane,
  evaluateCosUniversityUndergraduateAcademicLane,
  type CosUniversityUndergraduateAcademicLaneGate,
} from './cosUniversityProgramGate.ts'
import type { CosUniversityProgramEnrollment, CosUniversityProgramLevel } from './cosUniversityPrograms.ts'

const AGENT_ID = 'cos'
const UNDERGRADUATE_PROGRAM_KEY = 'generalist_undergraduate_v1'

type EnrollmentRow = {
  program_key: string
  program_level: CosUniversityProgramLevel
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

function mapEnrollment(row: EnrollmentRow): CosUniversityProgramEnrollment {
  return {
    programKey: row.program_key,
    programLevel: row.program_level,
    enrolledAt: row.enrolled_at,
    minimumResidenceUntil: row.minimum_residence_until,
    targetCompletionAt: row.target_completion_at,
    hardDeadlineAt: row.hard_deadline_at,
  }
}

/**
 * Read the shared academic lane gate. Kept under its original exported name because every
 * University cron route calls it by that name and a deployment gate asserts those call sites.
 */
export async function readCosUniversityUndergraduateAcademicLaneGate(
  now = new Date(),
  agentId: string = AGENT_ID,
): Promise<CosUniversityUndergraduateAcademicLaneGate> {
  const id = String(agentId || '').trim() || AGENT_ID
  const db = cosServiceDb()
  if (!db) {
    return {
      allowed: false,
      programKey: null,
      timingStatus: 'not_enrolled',
      reason: 'service_database_unavailable',
    }
  }

  const [enrollmentResult, credentialResult] = await Promise.all([
    db.from('cos_university_program_enrollments')
      .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
      .eq('agent_id', id)
      .order('enrolled_at', { ascending: false }),
    db.from('cos_university_credentials')
      .select('program_key')
      .eq('agent_id', id),
  ])

  if (enrollmentResult.error) throw enrollmentResult.error
  if (credentialResult.error) throw credentialResult.error

  const enrollments = ((enrollmentResult.data || []) as EnrollmentRow[]).map(mapEnrollment)
  const completedProgramKeys = ((credentialResult.data || []) as Array<{ program_key: string }>)
    .map((row) => row.program_key)

  const active = evaluateCosUniversityActiveAcademicLane({ enrollments, completedProgramKeys, now })
  if (active.allowed) return active

  // No live program. Report the undergraduate cohort's own terminal reason, so an operator reading a
  // skipped cron sees whether the agent graduated or ran out of time, not a bare "no program".
  const undergraduate = enrollments.find((row) => row.programKey === UNDERGRADUATE_PROGRAM_KEY) ?? null
  if (!undergraduate) return active
  return evaluateCosUniversityUndergraduateAcademicLane({
    enrollment: undergraduate,
    credentialAwarded: completedProgramKeys.includes(UNDERGRADUATE_PROGRAM_KEY),
    now,
  })
}
