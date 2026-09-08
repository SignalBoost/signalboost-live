// saas/lib/ai/cos/cosUniversityAdmissionRunner.ts
//
// Host-side execution of the admission decision. Reads the enrollment ledger, the credential
// ledger and the current subject transcript, asks the pure decision module whether a new program
// is due, and — only then — inserts ONE new immutable enrollment row.
//
// It never updates or deletes an enrollment (the table forbids both), never issues a credential,
// and never grades anything.

import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { academicStateFromRows, type CosUniversityAssessmentRow } from './cosUniversityAcademicState.ts'
import type { CosUniversityCredential, CosUniversityCredentialLevel } from './cosUniversityCredentials.ts'
import {
  decideCosUniversityAdmission,
  type CosUniversityAdmissionDecision,
} from './cosUniversityAdmission.ts'
import type { CosUniversityProgramEnrollment, CosUniversityProgramLevel } from './cosUniversityPrograms.ts'

const AGENT_ID = 'cos'

const ASSESSMENT_SELECT =
  'assessment_key,subject_id,language_code,language_dimension,assessment_kind,passed,independent_scorer,scorer_version,scorer_authority,observed_at,valid_until'

type EnrollmentRow = {
  program_key: string
  program_level: CosUniversityProgramLevel
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

type CredentialRow = {
  credential_key: string
  program_key: string
  program_level: CosUniversityCredentialLevel
  title: string
  standing: 'A' | 'A+'
  awarded_at: string
}

export type CosUniversityAdmissionSummary = {
  enabled: boolean
  decision: CosUniversityAdmissionDecision['reason']
  admitted: boolean
  programKey: string | null
  programLevel: CosUniversityProgramLevel | null
  trackId: string | null
  errors: string[]
  semantics: 'admission_is_host_computed_from_issued_credentials'
}

function summary(
  partial: Partial<CosUniversityAdmissionSummary> & { decision: CosUniversityAdmissionSummary['decision'] },
): CosUniversityAdmissionSummary {
  return {
    enabled: true,
    admitted: false,
    programKey: null,
    programLevel: null,
    trackId: null,
    errors: [],
    semantics: 'admission_is_host_computed_from_issued_credentials',
    ...partial,
  }
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

function mapCredential(row: CredentialRow): CosUniversityCredential {
  return {
    credentialKey: row.credential_key,
    programKey: row.program_key,
    programLevel: row.program_level,
    title: row.title,
    standing: row.standing,
    awardedAt: row.awarded_at,
  }
}

export async function runCosUniversityAdmission(
  options: { now?: Date } = {},
): Promise<CosUniversityAdmissionSummary> {
  const now = options.now instanceof Date ? options.now : new Date()

  if (process.env.COS_UNIVERSITY_ADMISSION_ENABLED !== 'true') {
    return summary({ enabled: false, decision: 'undergraduate_program_active' })
  }

  const db = cosServiceDb()
  if (!db) {
    return summary({ decision: 'undergraduate_program_active', errors: ['service_database_unavailable'] })
  }

  try {
    const [enrollmentResult, credentialResult, assessmentResult] = await Promise.all([
      db.from('cos_university_program_enrollments')
        .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
        .eq('agent_id', AGENT_ID),
      db.from('cos_university_credentials')
        .select('credential_key,program_key,program_level,title,standing,awarded_at')
        .eq('agent_id', AGENT_ID),
      db.from('cos_university_assessments')
        .select(ASSESSMENT_SELECT)
        .eq('agent_id', AGENT_ID)
        .order('observed_at', { ascending: false })
        .limit(2000),
    ])

    if (enrollmentResult.error) throw enrollmentResult.error
    if (credentialResult.error) throw credentialResult.error
    if (assessmentResult.error) throw assessmentResult.error

    const academicState = academicStateFromRows(
      (assessmentResult.data || []) as CosUniversityAssessmentRow[],
      now,
    )

    const decision = decideCosUniversityAdmission({
      enrollments: ((enrollmentResult.data || []) as EnrollmentRow[]).map(mapEnrollment),
      credentials: ((credentialResult.data || []) as CredentialRow[]).map(mapCredential),
      subjectTranscript: academicState.subjectTranscript,
      now,
    })

    if (!decision.admit) {
      return summary({ decision: decision.reason })
    }

    const insert = await db.from('cos_university_program_enrollments').insert({
      agent_id: AGENT_ID,
      program_key: decision.enrollment.programKey,
      program_level: decision.enrollment.programLevel,
      enrolled_at: decision.enrollment.enrolledAt,
      minimum_residence_until: decision.enrollment.minimumResidenceUntil,
      target_completion_at: decision.enrollment.targetCompletionAt,
      hard_deadline_at: decision.enrollment.hardDeadlineAt,
    })

    // A unique-violation means a concurrent run already opened the same program. That is the
    // desired end state, so it is success, not an error.
    const code = String((insert.error as { code?: string } | null)?.code || '')
    if (insert.error && code !== '23505') throw insert.error

    return summary({
      decision: decision.reason,
      admitted: true,
      programKey: decision.programKey,
      programLevel: decision.programLevel,
      trackId: decision.trackId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return summary({ decision: 'undergraduate_program_active', errors: [message] })
  }
}
