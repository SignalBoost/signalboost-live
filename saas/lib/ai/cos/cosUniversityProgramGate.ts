import type { CosUniversityGeneralistGraduationStatus } from './cosUniversityGraduation.ts'
import {
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramTimingStatus,
} from './cosUniversityPrograms.ts'

export type CosUniversityTimeBoundedGraduationStatus = CosUniversityGeneralistGraduationStatus & {
  program: {
    programKey: string | null
    programLevel: 'undergraduate'
    enrolledAt: string | null
    minimumResidenceUntil: string | null
    targetCompletionAt: string | null
    hardDeadlineAt: string | null
    timingStatus: CosUniversityProgramTimingStatus
    minimumResidenceSatisfied: boolean
    deadlineExpired: boolean
  }
}

export function applyCosUniversityUndergraduateCalendar(args: {
  academicStatus: CosUniversityGeneralistGraduationStatus
  enrollment: CosUniversityProgramEnrollment | null
  now?: Date
}): CosUniversityTimeBoundedGraduationStatus {
  const now = args.now instanceof Date ? args.now : new Date()
  const timingStatus = cosUniversityProgramTimingStatus(args.enrollment, now)
  const mayGraduate = cosUniversityProgramMayGraduate(args.enrollment, now)
  const evidenceGraduated = args.academicStatus.graduated
  const graduated = evidenceGraduated && mayGraduate
  const deadlineExpired = timingStatus === 'deadline_expired'
  const minimumResidenceSatisfied = timingStatus === 'on_schedule'
    || timingStatus === 'target_date_passed'
    || timingStatus === 'deadline_expired'

  return {
    ...args.academicStatus,
    graduated,
    standing: graduated ? args.academicStatus.standing : 'not_graduated',
    advancedLearningEligible: graduated,
    qualification: graduated ? 'advanced_learning_eligible' : 'undergraduate_in_progress',
    program: {
      programKey: args.enrollment?.programKey ?? null,
      programLevel: 'undergraduate',
      enrolledAt: args.enrollment?.enrolledAt ?? null,
      minimumResidenceUntil: args.enrollment?.minimumResidenceUntil ?? null,
      targetCompletionAt: args.enrollment?.targetCompletionAt ?? null,
      hardDeadlineAt: args.enrollment?.hardDeadlineAt ?? null,
      timingStatus,
      minimumResidenceSatisfied,
      deadlineExpired,
    },
  }
}
