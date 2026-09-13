import { COS_UNIVERSITY_PHD_PROGRAMS, type CosUniversityPhdProgramId } from './cosUniversityPhd.ts'
import {
  ensureCosUniversityPhdEnrollment,
  evaluateAndAwardCosUniversityPhdCredential,
  readCosUniversityPhdRuntimeStatus,
} from './cosUniversityPhdRuntime.ts'
import { requirePhdAgentId } from './cosUniversityPhdAgentScope.ts'

export async function runCosUniversityPhdAdmissionForAgent(now: Date, agentId: string): Promise<{
  checked: number
  enrolled: boolean
  programId: CosUniversityPhdProgramId | null
  errors: string[]
}> {
  requirePhdAgentId(agentId)
  const ids = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
  const errors: string[] = []
  for (const programId of ids) {
    try {
      const result = await ensureCosUniversityPhdEnrollment(programId, now, agentId)
      if (result.state === 'enrolled' || result.state === 'already_enrolled' || result.state === 'already_graduated') {
        return { checked: ids.indexOf(programId) + 1, enrolled: result.state !== 'already_graduated', programId, errors }
      }
    } catch (error) {
      errors.push(`${programId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { checked: ids.length, enrolled: false, programId: null, errors }
}

export async function runCosUniversityPhdProgressForAgent(now: Date, agentId: string): Promise<{
  checked: number
  awarded: boolean
  programId: CosUniversityPhdProgramId | null
  errors: string[]
}> {
  requirePhdAgentId(agentId)
  const ids = Object.keys(COS_UNIVERSITY_PHD_PROGRAMS) as CosUniversityPhdProgramId[]
  const errors: string[] = []
  for (const programId of ids) {
    try {
      const status = await readCosUniversityPhdRuntimeStatus(programId, now, agentId)
      if (!status.enrollment && !status.credential) continue
      const result = await evaluateAndAwardCosUniversityPhdCredential(programId, now, agentId)
      return {
        checked: ids.indexOf(programId) + 1,
        awarded: result.awarded,
        programId,
        errors: [...errors, ...(result.state === 'error' ? result.reasons : [])],
      }
    } catch (error) {
      errors.push(`${programId}:${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { checked: ids.length, awarded: false, programId: null, errors }
}
