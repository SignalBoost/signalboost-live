import type { CosUniversityGeneralistGraduationStatus } from './cosUniversityGraduation.ts'
import type { CosUniversityCredential } from './cosUniversityCredentials.ts'
import {
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramTimingStatus,
} from './cosUniversityPrograms.ts'

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
