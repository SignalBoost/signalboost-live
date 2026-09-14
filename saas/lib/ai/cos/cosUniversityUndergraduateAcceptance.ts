// saas/lib/ai/cos/cosUniversityUndergraduateAcceptance.ts
// Read-only undergraduate Production acceptance board.
// Classifies existing host receipts. Never writes grades, credentials, or ledger rows.

import {
  COS_UNIVERSITY_FEATURE_GATED_PATHS,
  universityProductionExecutionBlocker,
  type LearningPathId,
} from './cosUniversityLearningAssurance.ts'
import {
  evaluateCosUniversityProductionVerification,
  type ProductionPathEventRow,
} from './cosUniversityProductionVerificationCore.ts'

export const COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS = Object.freeze([
  'registered_agent_cycle',
  'continuous_learning',
  'deliberate_practice',
  'independent_exams',
  'subject_a_range_evidence',
  'language_a_range_evidence',
  'delayed_retention',
  'graduation',
] as const satisfies readonly LearningPathId[])

export type CosUniversityUndergraduateAcceptancePathId =
  typeof COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS[number]

export type CosUniversityUndergraduateAcceptanceStatus =
  | 'verified'
  | 'missing'
  | 'stale_commit'
  | 'wrong_deployment'
  | 'wrong_verifier'
  | 'expired'
  | 'flag_off'
  | 'invocation_failed'
  | 'idle_skip'
  | 'execution_blocked'
  | 'not_production'

export const COS_UNIVERSITY_ACADEMIC_ACCEPTANCE_PATHS = Object.freeze([
  'independent_exams',
  'subject_a_range_evidence',
  'language_a_range_evidence',
  'delayed_retention',
] as const satisfies readonly CosUniversityUndergraduateAcceptancePathId[])

export type CosUniversityUndergraduatePathAcceptance = Readonly<{
  path: CosUniversityUndergraduateAcceptancePathId
  featureFlag: string
  status: CosUniversityUndergraduateAcceptanceStatus
  receiptFound: boolean
  sameCommit: boolean
  sameDeployment: boolean
  featureEnabled: boolean
  invocationSucceeded: boolean
  fresh: boolean
  executionBlocker: string | null
  evidenceRef: string | null
  scoredAttemptPresent: boolean
}>

export type CosUniversityUndergraduateAcceptanceBoard = Readonly<{
  production: boolean
  deploymentId: string
  commitSha: string
  accepted: boolean
  verifiedCount: number
  requiredCount: number
  scoredAcademicPathCount: number
  missingOrInvalid: readonly CosUniversityUndergraduateAcceptancePathId[]
  paths: readonly CosUniversityUndergraduatePathAcceptance[]
  semantics: 'undergraduate_exact_production_commit_and_deployment_receipts_required'
}>

const UNDERGRADUATE_PATH_SET = new Set<LearningPathId>(COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS)
const ACADEMIC_PATH_SET = new Set<LearningPathId>(COS_UNIVERSITY_ACADEMIC_ACCEPTANCE_PATHS)

function isUndergraduatePath(path: string): path is CosUniversityUndergraduateAcceptancePathId {
  return UNDERGRADUATE_PATH_SET.has(path as LearningPathId)
}

function scoredAttemptPresent(path: CosUniversityUndergraduateAcceptancePathId, evidence: unknown): boolean {
  if (!ACADEMIC_PATH_SET.has(path)) return false
  return universityProductionExecutionBlocker(path, evidence) === null
}

function classifyStatus(input: {
  production: boolean
  commitSha: string
  deploymentId: string
  now: Date
  row: ProductionPathEventRow | undefined
  verified: boolean
  executionBlocker: string | null
}): CosUniversityUndergraduateAcceptanceStatus {
  if (!input.production || !input.commitSha || !input.deploymentId) return 'not_production'
  const row = input.row
  if (!row) return 'missing'
  if (row.verifier !== 'host_production_verifier') return 'wrong_verifier'
  if (row.commit_sha !== input.commitSha) return 'stale_commit'
  if (row.deployment_id !== input.deploymentId) return 'wrong_deployment'
  if (!row.expires_at || Date.parse(row.expires_at) <= input.now.getTime()) return 'expired'
  const evidence = row.evidence || {}
  if (evidence.featureEnabled !== true) return 'flag_off'
  if (evidence.invocationSucceeded !== true) return 'invocation_failed'
  if (
    evidence.skipped === true
    || evidence.runnerInvoked === false
    || evidence.dailyCadence === 'not_due'
    || input.executionBlocker === 'runner_not_invoked'
    || input.executionBlocker === 'runner_did_no_work'
    || input.executionBlocker === 'runner_disabled'
  ) return 'idle_skip'
  if (input.verified) return 'verified'
  if (input.executionBlocker) return 'execution_blocked'
  return 'execution_blocked'
}

export function evaluateCosUniversityUndergraduateAcceptance(input: {
  production: boolean
  deploymentId: string
  commitSha: string
  now: Date
  rows: readonly ProductionPathEventRow[]
}): CosUniversityUndergraduateAcceptanceBoard {
  const undergraduateRows = input.rows.filter(row => isUndergraduatePath(String(row.path_id || '')))
  const evaluated = evaluateCosUniversityProductionVerification({
    deploymentId: input.deploymentId,
    commitSha: input.commitSha,
    now: input.now,
    rows: undergraduateRows,
  })

  const latest = new Map<CosUniversityUndergraduateAcceptancePathId, ProductionPathEventRow>()
  for (const row of undergraduateRows) {
    if (row.commit_sha !== input.commitSha) continue
    const path = row.path_id as CosUniversityUndergraduateAcceptancePathId
    const existing = latest.get(path)
    const observed = Date.parse(row.observed_at)
    const previous = existing ? Date.parse(existing.observed_at) : Number.NaN
    if (!existing || observed > previous) latest.set(path, row)
  }

  const paths = COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS.map(path => {
    const evaluatedPath = evaluated.paths.find(item => item.path === path)
    const row = latest.get(path)
    const executionBlocker = evaluatedPath?.executionBlocker ?? universityProductionExecutionBlocker(path, row?.evidence || null)
    const status = classifyStatus({
      production: input.production,
      commitSha: input.commitSha,
      deploymentId: input.deploymentId,
      now: input.now,
      row,
      verified: evaluatedPath?.verified === true,
      executionBlocker,
    })
    return Object.freeze({
      path,
      featureFlag: COS_UNIVERSITY_FEATURE_GATED_PATHS[path],
      status,
      receiptFound: Boolean(row),
      sameCommit: row?.commit_sha === input.commitSha,
      sameDeployment: row?.deployment_id === input.deploymentId,
      featureEnabled: evaluatedPath?.featureEnabled === true,
      invocationSucceeded: evaluatedPath?.invocationSucceeded === true,
      fresh: evaluatedPath?.fresh === true,
      executionBlocker,
      evidenceRef: evaluatedPath?.evidenceRef ?? null,
      scoredAttemptPresent: scoredAttemptPresent(path, row?.evidence || null),
    })
  })

  const missingOrInvalid = paths
    .filter(path => path.status !== 'verified')
    .map(path => path.path)

  return Object.freeze({
    production: input.production,
    deploymentId: input.deploymentId,
    commitSha: input.commitSha,
    accepted: missingOrInvalid.length === 0 && paths.some(path => path.scoredAttemptPresent),
    verifiedCount: paths.filter(path => path.status === 'verified').length,
    requiredCount: COS_UNIVERSITY_UNDERGRADUATE_ACCEPTANCE_PATHS.length,
    scoredAcademicPathCount: paths.filter(path => path.scoredAttemptPresent).length,
    missingOrInvalid,
    paths,
    semantics: 'undergraduate_exact_production_commit_and_deployment_receipts_required',
  })
}
