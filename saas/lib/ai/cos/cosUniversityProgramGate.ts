import type { CosUniversityGeneralistGraduationStatus } from './cosUniversityGraduation.ts'
import type { CosUniversityCredential } from './cosUniversityCredentials.ts'
import {
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramTimingStatus,
} from './cosUniversityPrograms.ts'

const UNDERGRADUATE_PROGRAM_KEY = 'generalist_undergraduate_v1'

export type CosUniversityUndergraduateAcademicLaneGate = {
  allowed: boolean
  programKey: string | null
  timingStatus: CosUniversityProgramTimingStatus | 'graduated'
  reason:
    | 'active_undergraduate_program'
    | 'undergraduate_program_not_enrolled'
    | 'undergraduate_program_deadline_expired'
    | 'undergraduate_program_graduated'
    | 'service_database_unavailable'
}

/**
 * Undergraduate worker lanes may run only while the current cohort is active.
 * Minimum residence does not block study/exams; it blocks degree award only. Once the cohort expires
 * uncompleted, or once the degree is awarded, undergraduate workers stop. Continuing education or a
 * later degree must use a new explicit program enrollment rather than silently extending this cohort.
 */
export function evaluateCosUniversityUndergraduateAcademicLane(args: {
  enrollment: CosUniversityProgramEnrollment | null
  credentialAwarded?: boolean
  now?: Date
}): CosUniversityUndergraduateAcademicLaneGate {
  const now = args.now instanceof Date ? args.now : new Date()
  const timingStatus = cosUniversityProgramTimingStatus(args.enrollment, now)
  if (args.credentialAwarded) {
    return {
      allowed: false,
      programKey: args.enrollment?.programKey ?? UNDERGRADUATE_PROGRAM_KEY,
      timingStatus: 'graduated',
      reason: 'undergraduate_program_graduated',
    }
  }
  if (timingStatus === 'not_enrolled') {
    return { allowed: false, programKey: null, timingStatus, reason: 'undergraduate_program_not_enrolled' }
  }
  if (timingStatus === 'deadline_expired') {
    return {
      allowed: false,
      programKey: args.enrollment?.programKey ?? UNDERGRADUATE_PROGRAM_KEY,
      timingStatus,
      reason: 'undergraduate_program_deadline_expired',
    }
  }
  return {
    allowed: true,
    programKey: args.enrollment?.programKey ?? UNDERGRADUATE_PROGRAM_KEY,
    timingStatus,
    reason: 'active_undergraduate_program',
  }
}

export type CosUniversityTimeBoundedGraduationStatus = CosUniversityGeneralistGraduationStatus & {
  awardEligible: boolean
  currentCompetenceStanding: 'not_graduated' | 'A' | 'A+'
  credential: CosUniversityCredential | null
  program: {
    programKey: string | null
    programLevel: 'undergraduate'
    enrolledAt: string | null
    minimumResidenceUntil: string | null
    targetCompletionAt: string | null
    hardDeadlineAt: string | null
    timingStatus: CosUniversityProgramTimingStatus | 'graduated'
    minimumResidenceSatisfied: boolean
    deadlineExpired: boolean
  }
}

export function applyCosUniversityUndergraduateCalendar(args: {
  academicStatus: CosUniversityGeneralistGraduationStatus
  enrollment: CosUniversityProgramEnrollment | null
  credential?: CosUniversityCredential | null
  now?: Date
}): CosUniversityTimeBoundedGraduationStatus {
  const now = args.now instanceof Date ? args.now : new Date()
  const credential = args.credential ?? null
  const rawTimingStatus = cosUniversityProgramTimingStatus(args.enrollment, now)
  const mayGraduate = cosUniversityProgramMayGraduate(args.enrollment, now)
  const deadlineExpired = rawTimingStatus === 'deadline_expired'
  const minimumResidenceSatisfied = rawTimingStatus === 'on_schedule'
    || rawTimingStatus === 'target_date_passed'
    || rawTimingStatus === 'deadline_expired'
    || Boolean(credential)
  const awardEligible = !credential && args.academicStatus.graduated && mayGraduate
  const graduated = Boolean(credential)
  const standing = credential?.standing ?? 'not_graduated'

  return {
    ...args.academicStatus,
    graduated,
    standing,
    currentCompetenceStanding: args.academicStatus.standing,
    awardEligible,
    advancedLearningEligible: graduated,
    qualification: graduated ? 'advanced_learning_eligible' : 'undergraduate_in_progress',
    credential,
    program: {
      programKey: args.enrollment?.programKey ?? credential?.programKey ?? null,
      programLevel: 'undergraduate',
      enrolledAt: args.enrollment?.enrolledAt ?? null,
      minimumResidenceUntil: args.enrollment?.minimumResidenceUntil ?? null,
      targetCompletionAt: args.enrollment?.targetCompletionAt ?? null,
      hardDeadlineAt: args.enrollment?.hardDeadlineAt ?? null,
      timingStatus: credential ? 'graduated' : rawTimingStatus,
      minimumResidenceSatisfied,
      deadlineExpired: credential ? false : deadlineExpired,
    },
  }
}
