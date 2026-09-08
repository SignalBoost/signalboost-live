import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  evaluateCosUniversityUndergraduateAcademicLane,
  type CosUniversityUndergraduateAcademicLaneGate,
} from './cosUniversityProgramGate.ts'
import type { CosUniversityProgramEnrollment } from './cosUniversityPrograms.ts'

const AGENT_ID = 'cos'
const UNDERGRADUATE_PROGRAM_KEY = 'generalist_undergraduate_v1'

type UndergraduateEnrollmentRow = {
  program_key: string
  program_level: 'undergraduate'
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

function mapUndergraduateEnrollment(row: UndergraduateEnrollmentRow | null): CosUniversityProgramEnrollment | null {
  if (!row) return null
  return {
    programKey: row.program_key,
    programLevel: row.program_level,
    enrolledAt: row.enrolled_at,
    minimumResidenceUntil: row.minimum_residence_until,
    targetCompletionAt: row.target_completion_at,
    hardDeadlineAt: row.hard_deadline_at,
  }
}

/** Service-side execution gate shared by every scheduled undergraduate academic worker lane. */
export async function readCosUniversityUndergraduateAcademicLaneGate(
  now = new Date(),
): Promise<CosUniversityUndergraduateAcademicLaneGate> {
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
      .eq('agent_id', AGENT_ID)
      .eq('program_key', UNDERGRADUATE_PROGRAM_KEY)
      .maybeSingle(),
    db.from('cos_university_credentials')
      .select('credential_key')
      .eq('agent_id', AGENT_ID)
      .eq('program_key', UNDERGRADUATE_PROGRAM_KEY)
      .maybeSingle(),
  ])

  if (enrollmentResult.error) throw enrollmentResult.error
  if (credentialResult.error) throw credentialResult.error

  return evaluateCosUniversityUndergraduateAcademicLane({
    enrollment: mapUndergraduateEnrollment((enrollmentResult.data || null) as UndergraduateEnrollmentRow | null),
    credentialAwarded: Boolean(credentialResult.data),
    now,
  })
}
