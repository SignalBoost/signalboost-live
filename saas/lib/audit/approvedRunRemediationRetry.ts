import { recoverMergedApprovedRemediation } from '@/lib/audit/approvedRunMergedRecovery'
import { recoverTransientPartialAuditWrites } from '@/lib/audit/approvedRunPartialRecovery'
import {
  runApprovedAuditRemediationSystem,
  type ApprovedRunSystemResult,
} from '@/lib/audit/approvedRunRemediationSystem'

const MAX_ATTEMPTS = 3
const RETRY_DELAYS_MS = [0, 500, 1500] as const

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

export async function runApprovedAuditRemediationWithRetry(params: {
  admin: any
  runId: string
  actorUserId: string
}): Promise<ApprovedRunSystemResult> {
  let last: ApprovedRunSystemResult | null = null

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt]
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))

    const merged = await recoverMergedApprovedRemediation(params)
    if (merged) {
      last = merged
      if (merged.ok || !isTransientApprovedRemediationFailure(merged)) return merged
      continue
    }

    last = await runApprovedAuditRemediationSystem(params)

    if (last.status === 'partial' || last.lifecycleStatus === 'partial') {
      const recovered = await recoverTransientPartialAuditWrites({ ...params, result: last })
      if (recovered) {
        last = recovered
        if (recovered.lifecycleStatus === 'checks_pending') {
          last = await runApprovedAuditRemediationSystem(params)
        }
      }
    }

    if (last.ok || !isTransientApprovedRemediationFailure(last)) return last
  }

  return last as ApprovedRunSystemResult
}
