import {
  COS_UNIVERSITY_FEATURE_GATED_PATHS,
  verifyLearningPathReceipts,
  type LearningPathId,
  type ProductionPathReceipt,
} from './cosUniversityLearningAssurance.ts'

export type ProductionPathEventRow = Readonly<{
  event_key: string
  path_id: string | null
  deployment_id: string | null
  commit_sha: string | null
  evidence: Record<string, unknown> | null
  verifier: string
  observed_at: string
  expires_at: string | null
}>

export const UNIVERSITY_PRODUCTION_PATHS = Object.keys(COS_UNIVERSITY_FEATURE_GATED_PATHS) as LearningPathId[]

export function evaluateCosUniversityProductionVerification(input: {
  deploymentId: string
  commitSha: string
  now: Date
  rows: readonly ProductionPathEventRow[]
}) {
  const latest = new Map<LearningPathId, ProductionPathEventRow>()
  for (const row of input.rows) {
    if (!UNIVERSITY_PRODUCTION_PATHS.includes(row.path_id as LearningPathId) || row.commit_sha !== input.commitSha) continue
    const path = row.path_id as LearningPathId
    const existing = latest.get(path)
    if (!existing || Date.parse(row.observed_at) > Date.parse(existing.observed_at)) latest.set(path, row)
  }
  const receipts: ProductionPathReceipt[] = []
  const paths = UNIVERSITY_PRODUCTION_PATHS.map(path => {
    const row = latest.get(path)
    const evidence = row?.evidence || {}
    const featureEnabled = evidence.featureEnabled === true
    const invocationSucceeded = evidence.invocationSucceeded === true
    const fresh = Boolean(row?.expires_at) && Date.parse(row!.expires_at!) > input.now.getTime()
    const sameDeployment = row?.deployment_id === input.deploymentId
    const verified = Boolean(row && featureEnabled && invocationSucceeded && fresh && sameDeployment
      && row.verifier === 'host_production_verifier')
    if (row?.deployment_id && row.commit_sha && row.expires_at && row.verifier === 'host_production_verifier') receipts.push({
      path, deploymentId: row.deployment_id, commitSha: row.commit_sha, observedAt: row.observed_at,
      expiresAt: row.expires_at, featureEnabled, invocationSucceeded,
      durableEvidenceRef: `db://cos_university_learning_assurance_events/${row.event_key}`, verifier: row.verifier,
    })
    return {
      path, featureFlag: COS_UNIVERSITY_FEATURE_GATED_PATHS[path], featureEnabled,
      receiptFound: Boolean(row), sameDeployment, invocationSucceeded, fresh, verified,
      evidenceRef: row ? `db://cos_university_learning_assurance_events/${row.event_key}` : null,
    }
  })
  const aggregate = verifyLearningPathReceipts({
    expectedCommitSha: input.commitSha, now: input.now,
    receipts: receipts.filter(receipt => receipt.deploymentId === input.deploymentId),
    requiredPaths: UNIVERSITY_PRODUCTION_PATHS,
  })
  return { verified: aggregate.verified && paths.every(path => path.verified), missingOrInvalid: paths.filter(path => !path.verified).map(path => path.path), paths }
}
