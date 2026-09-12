import {
  COS_UNIVERSITY_FEATURE_GATED_PATHS,
  verifyLearningPathReceipts,
  universityProductionExecutionBlocker,
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

function receiptFromEvent(row: ProductionPathEventRow | undefined, path: LearningPathId): ProductionPathReceipt | null {
  if (!row?.deployment_id || !row.commit_sha || !row.expires_at
    || !row.event_key.trim() || row.verifier !== 'host_production_verifier') return null
  return {
    path, deploymentId: row.deployment_id, commitSha: row.commit_sha, observedAt: row.observed_at,
    expiresAt: row.expires_at, featureEnabled: row.evidence?.featureEnabled === true,
    invocationSucceeded: row.evidence?.invocationSucceeded === true, executionEvidence: row.evidence,
    durableEvidenceRef: `db://cos_university_learning_assurance_events/${row.event_key}`, verifier: row.verifier,
  }
}

export function evaluateCosUniversityProductionVerification(input: {
  deploymentId: string
  commitSha: string
  now: Date
  rows: readonly ProductionPathEventRow[]
}) {
  const rowVerified = (row: ProductionPathEventRow | undefined, path: LearningPathId): boolean => {
    const receipt = receiptFromEvent(row, path)
    return Boolean(row?.deployment_id === input.deploymentId && receipt && verifyLearningPathReceipts({
      expectedCommitSha: input.commitSha, now: input.now, receipts: [receipt], requiredPaths: [path],
    }).verified)
  }
  const latest = new Map<LearningPathId, ProductionPathEventRow>()
  for (const row of input.rows) {
    if (!UNIVERSITY_PRODUCTION_PATHS.includes(row.path_id as LearningPathId) || row.commit_sha !== input.commitSha) continue
    const path = row.path_id as LearningPathId
    const existing = latest.get(path)
    const observed = Date.parse(row.observed_at)
    const previous = existing ? Date.parse(existing.observed_at) : NaN
    let preferTied = false
    if (existing && observed === previous) {
      // Millisecond ties cannot establish chronology across invocations. Fail closed when their
      // verification outcomes disagree; only a later observation can establish recovery.
      const candidateVerified = rowVerified(row, path)
      const existingVerified = rowVerified(existing, path)
      // The key stabilizes evidence selection among equally verifiable ties, never their time order.
      preferTied = candidateVerified !== existingVerified ? !candidateVerified : row.event_key < existing.event_key
    }
    if (!existing || observed > previous || preferTied) latest.set(path, row)
  }
  const receipts: ProductionPathReceipt[] = []
  const paths = UNIVERSITY_PRODUCTION_PATHS.map(path => {
    const row = latest.get(path)
    const evidence = row?.evidence || {}
    const featureEnabled = evidence.featureEnabled === true
    const invocationSucceeded = evidence.invocationSucceeded === true
    const fresh = Boolean(row?.expires_at) && Date.parse(row!.expires_at!) > input.now.getTime()
    const sameDeployment = row?.deployment_id === input.deploymentId
    const executionBlocker = universityProductionExecutionBlocker(path, row?.evidence)
    const receipt = receiptFromEvent(row, path)
    if (receipt) receipts.push(receipt)
    // Use the same time, identity and execution checks for the row and aggregate status.
    const verified = rowVerified(row, path)
    return {
      path, featureFlag: COS_UNIVERSITY_FEATURE_GATED_PATHS[path], featureEnabled,
      receiptFound: Boolean(row), sameDeployment, invocationSucceeded, fresh, verified, executionBlocker,
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
