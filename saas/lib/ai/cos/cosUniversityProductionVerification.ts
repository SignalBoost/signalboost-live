// saas/lib/ai/cos/cosUniversityProductionVerification.ts
import { cosServiceDb } from '../../cos-core/storage/supabase.ts'
import {
  evaluateCosUniversityProductionVerification,
  UNIVERSITY_PRODUCTION_PATHS,
  type ProductionPathEventRow,
} from './cosUniversityProductionVerificationCore.ts'
import {
  classifyCosUniversityLane,
  cosUniversityLaneExpectation,
  cosUniversityLaneStatusIsFault,
  type CosUniversityLaneStatus,
} from './cosUniversityLaneExpectation.ts'
import {
  cosUniversityProgramMayGraduate,
  cosUniversityProgramTimingStatus,
  type CosUniversityProgramEnrollment,
  type CosUniversityProgramLevel,
  type CosUniversityProgramTimingStatus,
} from './cosUniversityPrograms.ts'

const UNDERGRADUATE_PROGRAM_KEY = 'generalist_undergraduate_v1'
const DEFAULT_AGENT_ID = 'cos'

type EnrollmentRow = {
  program_key: string
  program_level: CosUniversityProgramLevel
  enrolled_at: string
  minimum_residence_until: string
  target_completion_at: string
  hard_deadline_at: string
}

function mapEnrollment(row: EnrollmentRow): CosUniversityProgramEnrollment & { programLevel: CosUniversityProgramLevel } {
  return {
    programKey: row.program_key,
    programLevel: row.program_level,
    enrolledAt: row.enrolled_at,
    minimumResidenceUntil: row.minimum_residence_until,
    targetCompletionAt: row.target_completion_at,
    hardDeadlineAt: row.hard_deadline_at,
  }
}

/**
 * What the calendar says SHOULD be happening, read from the same enrollment rows the cron gates
 * read. A lane's expectation is never hand-declared, so it cannot drift away from the runners.
 */
async function readLaneExpectationContext(agentId: string, now: Date): Promise<{
  timingByLevel: Partial<Record<CosUniversityProgramLevel, CosUniversityProgramTimingStatus>>
  terminalPrerequisiteMet: Partial<Record<string, boolean>>
  contextAvailable: boolean
}> {
  const db = cosServiceDb()
  if (!db) return { timingByLevel: {}, terminalPrerequisiteMet: {}, contextAvailable: false }

  const [enrollmentResult, credentialResult] = await Promise.all([
    db.from('cos_university_program_enrollments')
      .select('program_key,program_level,enrolled_at,minimum_residence_until,target_completion_at,hard_deadline_at')
      .eq('agent_id', agentId)
      .order('enrolled_at', { ascending: false }),
    db.from('cos_university_credentials').select('program_key').eq('agent_id', agentId),
  ])
  if (enrollmentResult.error) throw enrollmentResult.error
  if (credentialResult.error) throw credentialResult.error

  const enrollments = ((enrollmentResult.data || []) as EnrollmentRow[]).map(mapEnrollment)
  const credentials = new Set(((credentialResult.data || []) as Array<{ program_key: string }>).map(row => row.program_key))

  const timingByLevel: Partial<Record<CosUniversityProgramLevel, CosUniversityProgramTimingStatus>> = {}
  for (const enrollment of enrollments) {
    // Newest enrollment per level wins; the query is already ordered newest-first.
    if (timingByLevel[enrollment.programLevel]) continue
    timingByLevel[enrollment.programLevel] = cosUniversityProgramTimingStatus(enrollment, now)
  }

  const undergraduate = enrollments.find(row => row.programKey === UNDERGRADUATE_PROGRAM_KEY) ?? null
  const terminalPrerequisiteMet: Partial<Record<string, boolean>> = {
    // Graduation may run only once residence has elapsed and the cohort is still inside its deadline.
    graduation: cosUniversityProgramMayGraduate(undergraduate, now),
    // Admission into a program requires the prior credential actually issued, never inferred.
    masters_admission: credentials.has(UNDERGRADUATE_PROGRAM_KEY),
    phd_admission: [...credentials].some(key => key.includes('masters')),
  }

  return { timingByLevel, terminalPrerequisiteMet, contextAvailable: true }
}

export async function readCosUniversityProductionVerification(now = new Date(), agentId = DEFAULT_AGENT_ID) {
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || ''
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || ''
  const production = process.env.VERCEL_ENV === 'production'
  if (!production || !deploymentId || !commitSha) return {
    production, deploymentId, commitSha, verified: false,
    missingOrInvalid: UNIVERSITY_PRODUCTION_PATHS,
    paths: [],
    faults: [],
    semantics: 'exact_production_commit_and_deployment_receipts_required',
  }
  const db = cosServiceDb()
  if (!db) throw new Error('service_database_unavailable')
  const result = await db.from('cos_university_learning_assurance_events')
    .select('event_key,path_id,deployment_id,commit_sha,evidence,verifier,observed_at,expires_at')
    .eq('event_type', 'production_path')
    .eq('commit_sha', commitSha)
    .order('observed_at', { ascending: false })
    .limit(500)
  if (result.error) throw result.error

  const evaluated = evaluateCosUniversityProductionVerification({
    deploymentId, commitSha, now, rows: (result.data || []) as ProductionPathEventRow[],
  })

  // A path can be unverified for three unrelated reasons, and the board alone cannot tell them
  // apart. Classify each against the calendar so a lane that went dark is distinguishable from one
  // that is correctly gated or simply has no eligible work yet.
  const context = await readLaneExpectationContext(agentId, now)
  const paths = evaluated.paths.map(path => {
    const expectation = cosUniversityLaneExpectation({
      path: path.path,
      timingByLevel: context.timingByLevel,
      terminalPrerequisiteMet: context.terminalPrerequisiteMet[path.path] === true,
    })
    const laneStatus: CosUniversityLaneStatus = classifyCosUniversityLane(expectation, {
      path: path.path,
      featureEnabled: path.featureEnabled === true,
      verified: path.verified === true,
      executionBlocker: path.executionBlocker ?? null,
    })
    return { ...path, expectation, laneStatus }
  })

  const faults = paths
    .filter(path => cosUniversityLaneStatusIsFault(path.laneStatus))
    .map(path => ({ path: path.path, laneStatus: path.laneStatus, featureFlag: path.featureFlag }))

  return {
    production, deploymentId, commitSha,
    ...evaluated,
    paths,
    faults,
    expectationContextAvailable: context.contextAvailable,
    semantics: 'exact_production_commit_and_deployment_receipts_required',
  }
}
