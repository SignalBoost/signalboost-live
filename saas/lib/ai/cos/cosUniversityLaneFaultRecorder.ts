// saas/lib/ai/cos/cosUniversityLaneFaultRecorder.ts
/**
 * The expectation layer can tell a deliberately gated lane from one that went dark. That knowledge
 * was still only visible to someone who opened the assurance endpoint — which is exactly how the
 * independent exam lane stayed off for hours on 2026-09-13 while three downstream lanes waited on
 * passes it could no longer produce.
 *
 * This records a fault as durable evidence the moment it is observed, so absence enters the same
 * ledger every other academic observation uses instead of waiting to be noticed.
 *
 * Boundaries, deliberately narrow:
 *   - It records ONLY faults. A healthy sweep writes nothing.
 *   - A `lane_fault` row is an observation of absence. It never awards, advances or revokes a grade,
 *     and `readCosUniversityProductionVerification` reads only `production_path` rows, so nothing
 *     here can make a lane look verified.
 *   - Identity is bucketed by hour, so a fault persisting across ticks writes once per hour rather
 *     than on every sweep, and a fault that clears and returns is recorded again.
 *   - A fresh deployment gets one bounded schedule grace before an absent receipt becomes a durable
 *     dark-lane fault. Verification remains strict during the grace; only the incident record waits.
 */

import { createHash } from 'node:crypto'
import { cosServiceDb } from '../../cos-core/storage/supabase.ts'
import { COS_UNIVERSITY_ASSURANCE_PROFILE, type LearningPathId } from './cosUniversityLearningAssurance.ts'
import type { CosUniversityLaneStatus } from './cosUniversityLaneExpectation.ts'

const FIRST_SCHEDULE_GRACE_MS = 65 * 60_000

export type CosUniversityLaneFault = Readonly<{
  path: LearningPathId
  laneStatus: CosUniversityLaneStatus
  featureFlag?: string
}>

export type CosUniversityLaneFaultSweep = Readonly<{
  recorded: number
  faults: readonly string[]
  skipped: string | null
}>

/** One identity per path, status and hour, so a standing fault does not flood the ledger. */
function faultEventKey(input: {
  path: string
  laneStatus: string
  commitSha: string
  deploymentId: string
  hourBucket: string
}): string {
  return createHash('sha256').update([
    COS_UNIVERSITY_ASSURANCE_PROFILE, 'lane_fault',
    input.path, input.laneStatus, input.commitSha, input.deploymentId, input.hourBucket,
  ].join('|')).digest('hex')
}

export async function recordCosUniversityLaneFaults(input: {
  faults: readonly CosUniversityLaneFault[]
  agentId: string
  now?: Date
}): Promise<CosUniversityLaneFaultSweep> {
  const faults = input.faults.filter(fault => Boolean(fault?.path))
  if (!faults.length) return { recorded: 0, faults: [], skipped: null }

  const db = cosServiceDb()
  const deploymentId = process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || ''
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || ''
  // Same discipline as the production receipts: an observation that cannot name the exact build it
  // was taken on is not evidence, so it is skipped rather than stored ambiguously.
  if (!db) return { recorded: 0, faults: [], skipped: 'service_database_unavailable' }
  if (process.env.VERCEL_ENV !== 'production' || !deploymentId || !commitSha) {
    return { recorded: 0, faults: [], skipped: 'not_production_deployment' }
  }

  const now = input.now || new Date()
  let effectiveFaults = faults
  let startupGraceActive = false

  // All current University schedules recur at least hourly. A deployment that becomes READY just
  // after an hourly slot can therefore owe no receipt for almost sixty minutes. Use the first exact-
  // deployment Production receipt as the deployment-live lower bound and add five minutes of
  // scheduler tolerance. Only absence (`unexpectedly_dark`) is deferred: a receipt that explicitly
  // reports a disabled flag, failed execution, staging drift, or undeclared lane is still recorded
  // immediately. If this lookup fails, fail toward visibility and keep the original faults.
  if (faults.some(fault => fault.laneStatus === 'unexpectedly_dark')) {
    const firstReceipt = await db.from('cos_university_learning_assurance_events')
      .select('observed_at')
      .eq('event_type', 'production_path')
      .eq('deployment_id', deploymentId)
      .eq('commit_sha', commitSha)
      .order('observed_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (!firstReceipt.error && firstReceipt.data?.observed_at) {
      const firstObservedMs = Date.parse(String(firstReceipt.data.observed_at))
      const ageMs = now.getTime() - firstObservedMs
      startupGraceActive = Number.isFinite(firstObservedMs)
        && ageMs >= 0
        && ageMs < FIRST_SCHEDULE_GRACE_MS
      if (startupGraceActive) {
        effectiveFaults = faults.filter(fault => fault.laneStatus !== 'unexpectedly_dark')
      }
    }
  }

  if (!effectiveFaults.length) {
    return {
      recorded: 0,
      faults: [],
      skipped: startupGraceActive ? 'fresh_deployment_schedule_grace' : null,
    }
  }

  const hourBucket = now.toISOString().slice(0, 13)
  const observedAt = now.toISOString()
  const rows = effectiveFaults.map(fault => {
    const evidence = {
      claim: 'expected_lane_not_running_not_academic_evidence',
      path: fault.path,
      laneStatus: fault.laneStatus,
      featureFlag: fault.featureFlag || null,
      agentId: input.agentId,
      observedAt,
    }
    const evidenceHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
    return {
      event_key: faultEventKey({
        path: String(fault.path), laneStatus: String(fault.laneStatus),
        commitSha, deploymentId, hourBucket,
      }),
      event_type: 'lane_fault',
      path_id: fault.path,
      deployment_id: deploymentId,
      commit_sha: commitSha,
      evidence_hash: evidenceHash,
      evidence,
      verifier: 'host_production_verifier',
      observed_at: observedAt,
      // Retained a week: long enough to show a fault persisting across deploys, short enough that a
      // resolved fault does not linger as if current.
      expires_at: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    }
  })

  const inserted = await db.from('cos_university_learning_assurance_events')
    .upsert(rows, { onConflict: 'event_key', ignoreDuplicates: true })
  if (inserted.error) throw inserted.error

  return {
    recorded: rows.length,
    faults: effectiveFaults.map(fault => `${fault.path}:${fault.laneStatus}`),
    skipped: null,
  }
}
