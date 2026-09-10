import type { CosUniversityCredential } from './cosUniversityCredentials.ts'
import type { CosUniversityProgramEnrollment } from './cosUniversityPrograms.ts'
import type { CosUniversityAgentRole } from './cosUniversityRoleCurriculum.ts'

export type CosUniversityModuleProgress = Readonly<{
  moduleKey: string
  attempts: number
  passed: boolean
  remediationRequired: boolean
  lastObservedAt: string | null
}>

export type CosUniversityModuleAttempt = Readonly<{
  moduleKey: string | null
  passed: boolean
  observedAt: string
}>

export type CosUniversityAgentAcademicRecord = Readonly<{
  agentId: string
  role: CosUniversityAgentRole
  enrollment: CosUniversityProgramEnrollment | null
  credential: CosUniversityCredential | null
  modules: readonly CosUniversityModuleProgress[]
  modulesPassed: number
  modulesRequired: number
  completionRatio: number
  graduationStatus: 'not_enrolled' | 'in_progress' | 'remediation_required' | 'graduated'
}>

/** Builds a truthful per-agent transcript. Exposure never counts as a pass. */
export function buildCosUniversityAgentAcademicRecord(input: {
  agentId: string
  role: CosUniversityAgentRole
  requiredModuleKeys: readonly string[]
  enrollments: readonly CosUniversityProgramEnrollment[]
  credentials: readonly CosUniversityCredential[]
  attempts: readonly CosUniversityModuleAttempt[]
}): CosUniversityAgentAcademicRecord {
  const agentId = String(input.agentId || '').trim()
  if (!agentId) throw new Error('A durable AI agent identity is required.')
  const enrollment = input.enrollments.at(-1) ?? null
  const credential = input.credentials.at(-1) ?? null
  const modules = input.requiredModuleKeys.map((moduleKey) => {
    const attempts = input.attempts
      .filter((attempt) => attempt.moduleKey === moduleKey)
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt))
    const passed = attempts.some((attempt) => attempt.passed)
    return Object.freeze({
      moduleKey,
      attempts: attempts.length,
      passed,
      remediationRequired: attempts.some((attempt) => !attempt.passed) && !passed,
      lastObservedAt: attempts.at(-1)?.observedAt ?? null,
    })
  })
  const modulesPassed = modules.filter((module) => module.passed).length
  const remediationRequired = modules.some((module) => module.remediationRequired)
  const graduationStatus = credential
    ? 'graduated'
    : !enrollment
      ? 'not_enrolled'
      : remediationRequired
        ? 'remediation_required'
        : 'in_progress'
  return Object.freeze({
    agentId,
    role: input.role,
    enrollment,
    credential,
    modules: Object.freeze(modules),
    modulesPassed,
    modulesRequired: modules.length,
    completionRatio: modules.length ? modulesPassed / modules.length : 0,
    graduationStatus,
  })
}
