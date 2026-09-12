import { createHash, randomUUID } from 'node:crypto'
import { cosServiceDb } from '@/lib/cos-core/storage/supabase'
import {
  COS_UNIVERSITY_ASSURANCE_PROFILE,
  COS_UNIVERSITY_FEATURE_GATED_PATHS,
  type LearningPathId,
} from './cosUniversityLearningAssurance.ts'

function cleanEvidence(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { result: String(value ?? '') }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
}

/** Records what actually ran in Production. A receipt proves execution only, never mastery. */
export async function recordCosUniversityProductionPath(input: {
  path: LearningPathId
  invocationSucceeded: boolean
  evidence: Record<string, unknown>
  now?: Date
}): Promise<string | null> {
  const db = cosServiceDb()
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || ''
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || ''
  const featureFlag = COS_UNIVERSITY_FEATURE_GATED_PATHS[input.path]
  const featureEnabled = process.env[featureFlag] === 'true'
  if (!db || process.env.VERCEL_ENV !== 'production' || !deploymentId || !commitSha) return null
  const now = input.now || new Date()
  const evidence = {
    claim: 'path_executed_not_learning_improved', featureFlag, featureEnabled,
    invocationSucceeded: input.invocationSucceeded, ...cleanEvidence(input.evidence),
  }
  const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
  // Each recording is a distinct invocation observation, not an hourly content summary.
  // Keep identical outcomes (including recovery) append-only, even at the same clock instant.
  // Salt only the event identity: evidence hashes and execution/academic proof remain unchanged.
  const eventKey = createHash('sha256').update([
    COS_UNIVERSITY_ASSURANCE_PROFILE, input.path, deploymentId, commitSha,
    now.toISOString(), randomUUID(), evidenceHash,
  ].join('|')).digest('hex')
  const inserted = await db.from('cos_university_learning_assurance_events').upsert({
    event_key: eventKey, event_type: 'production_path', path_id: input.path,
    deployment_id: deploymentId, commit_sha: commitSha, evidence_hash: evidenceHash,
    evidence, verifier: 'host_production_verifier', observed_at: now.toISOString(),
    expires_at: new Date(now.getTime() + 86_400_000).toISOString(),
  }, { onConflict: 'event_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error
  return `db://cos_university_learning_assurance_events/${eventKey}`
}
