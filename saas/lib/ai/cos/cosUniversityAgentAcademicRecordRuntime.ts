import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import { COS_UNIVERSITY_SUBJECTS } from './cosUniversity.ts'
import type { CosUniversityCredential } from './cosUniversityCredentials.ts'
import type { CosUniversityProgramEnrollment } from './cosUniversityPrograms.ts'
import { assignCosUniversityRoleCurriculum } from './cosUniversityRoleCurriculum.ts'
import { readCosUniversityAgentRole } from './cosUniversityAgentRegistry.ts'
import { buildCosUniversityAgentAcademicRecord, type CosUniversityAgentAcademicRecord } from './cosUniversityAgentAcademicRecord.ts'

/** Reads durable ledgers and derives the current transcript for any registered AI agent. */
export async function readCosUniversityAgentAcademicRecord(agentId: string): Promise<CosUniversityAgentAcademicRecord> {
  const id = String(agentId || '').trim()
  if (!id) throw new Error('agent_id_required')
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const role = await readCosUniversityAgentRole(id)
  if (!role) throw new Error('agent_role_not_registered')
  const [enrollmentResult, credentialResult, assessmentResult, mastersResult] = await Promise.all([
    db.from('cos_university_program_enrollments').select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at').eq('agent_id', id).order('enrolled_at', { ascending: true }),
    db.from('cos_university_credentials').select('credential_key,program_key,program_level,title,standing,awarded_at').eq('agent_id', id).order('awarded_at', { ascending: true }),
    db.from('cos_university_assessments').select('subject_id,passed,observed_at').eq('agent_id', id),
    db.from('cos_university_masters_evidence').select('module_key,passed,observed_at').eq('agent_id', id),
  ])
  for (const result of [enrollmentResult, credentialResult, assessmentResult, mastersResult]) if (result.error) throw result.error
  const enrollments = ((enrollmentResult.data || []) as Array<Record<string, string>>).map((row) => ({
    programKey: row.program_key, programLevel: row.program_level as CosUniversityProgramEnrollment['programLevel'],
    enrolledAt: row.enrolled_at, minimumResidenceUntil: row.minimum_residence_until,
    targetCompletionAt: row.target_completion_at, hardDeadlineAt: row.hard_deadline_at,
  }))
  const credentials = ((credentialResult.data || []) as Array<Record<string, string>>).map((row) => ({
    credentialKey: row.credential_key, programKey: row.program_key,
    programLevel: row.program_level as CosUniversityCredential['programLevel'], title: row.title,
    standing: row.standing as CosUniversityCredential['standing'], awardedAt: row.awarded_at,
  }))
  const assignment = assignCosUniversityRoleCurriculum({
    agentId: id, role,
    undergraduateCredentialAwarded: credentials.some((credential) => credential.programLevel === 'undergraduate'),
  })
  const requiredModuleKeys = enrollments.at(-1)?.programLevel === 'masters'
    ? assignment.requiredModuleKeys : COS_UNIVERSITY_SUBJECTS.map((subject) => subject.id)
  const attempts = [
    ...((assessmentResult.data || []) as Array<{ subject_id: string; passed: boolean; observed_at: string }>).map((row) => ({ moduleKey: row.subject_id, passed: row.passed, observedAt: row.observed_at })),
    ...((mastersResult.data || []) as Array<{ module_key: string | null; passed: boolean; observed_at: string }>).map((row) => ({ moduleKey: row.module_key, passed: row.passed, observedAt: row.observed_at })),
  ]
  return buildCosUniversityAgentAcademicRecord({ agentId: id, role, requiredModuleKeys, enrollments, credentials, attempts })
}
