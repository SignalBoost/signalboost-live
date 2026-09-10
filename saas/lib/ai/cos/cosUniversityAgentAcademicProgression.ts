import type { CosUniversityAgentAcademicRecord } from './cosUniversityAgentAcademicRecord.ts'

export type CosUniversityNextAcademicAction = 'enroll' | 'study' | 'remediate' | 'independent_exam' | 'graduation_complete'

export function decideCosUniversityNextAcademicAction(
  record: Pick<CosUniversityAgentAcademicRecord, 'enrollment' | 'credential' | 'modules' | 'graduationStatus'>,
): CosUniversityNextAcademicAction {
  if (!record.enrollment) return 'enroll'
  if (record.credential || record.graduationStatus === 'graduated') return 'graduation_complete'
  if (record.modules.some((module) => module.remediationRequired)) return 'remediate'
  if (record.modules.length > 0 && record.modules.every((module) => module.passed)) return 'independent_exam'
  return 'study'
}
