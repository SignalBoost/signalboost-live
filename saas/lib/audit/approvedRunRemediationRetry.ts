import { recoverMergedApprovedRemediation } from '@/lib/audit/approvedRunMergedRecovery'
import { recoverTransientPartialAuditWrites } from '@/lib/audit/approvedRunPartialRecovery'
import { recordApprovedRemediationHeartbeat } from '@/lib/audit/remediationHeartbeat'
import {
  runApprovedAuditRemediationSystem,
  type ApprovedRunSystemResult,
} from '@/lib/audit/approvedRunRemediationSystem'

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [0, 500, 1500] as const

type HeartbeatResult = ApprovedRunSystemResult & { activityHeartbeatAt?: string }

function transientReason(value: string): boolean {
  const normalized = String(value || '').toLowerCase()
  return (
    /\b(429|500|502|503|504)\b/.test(normalized) ||
    normalized.includes('no server is currently available') ||
    normalized.includes('temporarily unavailable') ||
    normalized.includes('github request failed') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('connection reset') ||
    normalized.includes('socket hang up')
  )
}

export function isTransientApprovedRemediationFailure(result: ApprovedRunSystemResult): boolean {
  if (result.ok) return false
  return result.skipped.some(item => transientReason(item.reason)) || transientReason(result.autoMergeError)
}

function restoreSafetySkips(
  original: ApprovedRunSystemResult,
  recovered: ApprovedRunSystemResult,
): ApprovedRunSystemResult {
  const combined = [
    ...original.skipped.filter(item => !transientReason(item.reason)),
    ...recovered.skipped,
  ]
  const seen = new Set<string>()
  const skipped = combined.filter(item => {
    const key = `${item.file}\n${item.findingCount}\n${item.reason}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const hasSafetySkip = skipped.some(item => item.findingCount > 0 && !transientReason(item.reason))
  if (!hasSafetySkip) return { ...recovered, skipped }
  return {
    ...recovered,
    ok: true,
    status: 'partial',
    lifecycleStatus: 'partial',
    skipped,
  }
}

async function withWorkerHeartbeat(params: {
  admin: any
  runId: string
  actorUserId: string
}, result: ApprovedRunSystemResult): Promise<HeartbeatResult> {
  const activityHeartbeatAt = await recordApprovedRemediationHeartbeat({
    admin: params.admin,
    runId: params.runId,
    actorUserId: params.actorUserId,
    lifecycleStatus: result.lifecycleStatus,
  })
  return { ...result, activityHeartbeatAt }
}

export async function runApprovedAuditRemediationWithRetry(params: {
  admin: any
  runId: string
  actorUserId: string
}): Promise<HeartbeatResult> {
  let last: ApprovedRunSystemResult | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt]
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))

    const merged = await recoverMergedApprovedRemediation(params)
    if (merged) {
      last = merged
      if (merged.ok || !isTransientApprovedRemediationFailure(merged)) {
        return withWorkerHeartbeat(params, merged)
      }
      continue
    }

    last = await runApprovedAuditRemediationSystem(params)

    if (last.status === 'partial' || last.lifecycleStatus === 'partial') {
      const beforeRecovery = last
      const recovered = await recoverTransientPartialAuditWrites({ ...params, result: beforeRecovery })
      if (recovered) {
        last = restoreSafetySkips(beforeRecovery, recovered)
        if (last !== recovered) {
          await params.admin.from('audit_logs').insert({
            run_id: params.runId,
            user_id: params.actorUserId,
            payload: last,
          })
        }
        if (last.lifecycleStatus === 'checks_pending') {
          last = await runApprovedAuditRemediationSystem(params)
        }
      }
    }

    if (last.ok || !isTransientApprovedRemediationFailure(last)) {
      return withWorkerHeartbeat(params, last)
    }
  }

  return withWorkerHeartbeat(params, last as ApprovedRunSystemResult)
}
