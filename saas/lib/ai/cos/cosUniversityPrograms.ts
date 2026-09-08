export type CosUniversityProgramLevel = 'undergraduate' | 'masters' | 'phd' | 'professional_certificate'

export type CosUniversityProgramDefinition = Readonly<{
  level: CosUniversityProgramLevel
  title: string
  minimumResidenceDays: number
  targetCompletionDays: number
  hardDeadlineDays: number
}>

export const COS_UNIVERSITY_PROGRAMS: Readonly<Record<CosUniversityProgramLevel, CosUniversityProgramDefinition>> = Object.freeze({
  undergraduate: {
    level: 'undergraduate',
    title: 'Generalist Undergraduate Program',
    minimumResidenceDays: 60,
    targetCompletionDays: 120,
    hardDeadlineDays: 180,
  },
  masters: {
    level: 'masters',
    title: 'Specialist Master’s Program',
    minimumResidenceDays: 45,
    targetCompletionDays: 90,
    hardDeadlineDays: 180,
  },
  phd: {
    level: 'phd',
    title: 'Research PhD Program',
    minimumResidenceDays: 180,
    targetCompletionDays: 365,
    hardDeadlineDays: 730,
  },
  professional_certificate: {
    level: 'professional_certificate',
    title: 'Professional Certificate Program',
    minimumResidenceDays: 7,
    targetCompletionDays: 30,
    hardDeadlineDays: 90,
  },
})

export type CosUniversityProgramEnrollment = Readonly<{
  programKey: string
  programLevel: CosUniversityProgramLevel
  enrolledAt: string
  minimumResidenceUntil: string
  targetCompletionAt: string
  hardDeadlineAt: string
}>

export type CosUniversityProgramTimingStatus =
  | 'not_enrolled'
  | 'minimum_residence'
  | 'on_schedule'
  | 'target_date_passed'
  | 'deadline_expired'

function validTime(value: string): number | null {
  const parsed = Date.parse(String(value || ''))
  return Number.isFinite(parsed) ? parsed : null
}

export function buildCosUniversityProgramEnrollment(args: {
  programKey: string
  level: CosUniversityProgramLevel
  enrolledAt: Date
}): CosUniversityProgramEnrollment {
  const definition = COS_UNIVERSITY_PROGRAMS[args.level]
  const enrolled = new Date(args.enrolledAt)
  if (!Number.isFinite(enrolled.getTime())) throw new Error('Valid University enrollment date is required.')
  const dayMs = 86_400_000
  return Object.freeze({
    programKey: String(args.programKey || '').trim(),
    programLevel: args.level,
    enrolledAt: enrolled.toISOString(),
    minimumResidenceUntil: new Date(enrolled.getTime() + definition.minimumResidenceDays * dayMs).toISOString(),
    targetCompletionAt: new Date(enrolled.getTime() + definition.targetCompletionDays * dayMs).toISOString(),
    hardDeadlineAt: new Date(enrolled.getTime() + definition.hardDeadlineDays * dayMs).toISOString(),
  })
}

export function cosUniversityProgramTimingStatus(
  enrollment: CosUniversityProgramEnrollment | null | undefined,
  now = new Date(),
): CosUniversityProgramTimingStatus {
  if (!enrollment) return 'not_enrolled'
  const nowMs = now.getTime()
  const min = validTime(enrollment.minimumResidenceUntil)
  const target = validTime(enrollment.targetCompletionAt)
  const deadline = validTime(enrollment.hardDeadlineAt)
  if (!Number.isFinite(nowMs) || !min || !target || !deadline || !(min <= target && target < deadline)) return 'not_enrolled'
  if (nowMs < min) return 'minimum_residence'
  if (nowMs <= target) return 'on_schedule'
  if (nowMs <= deadline) return 'target_date_passed'
  return 'deadline_expired'
}

export function cosUniversityProgramMayGraduate(
  enrollment: CosUniversityProgramEnrollment | null | undefined,
  now = new Date(),
): boolean {
  const status = cosUniversityProgramTimingStatus(enrollment, now)
  return status === 'on_schedule' || status === 'target_date_passed'
}
