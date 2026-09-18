// saas/lib/ai/cos/cosLaneStatus.ts
// Records the current status of an autonomous lane so a stall is visible in one query.
//
// Why this is not the assurance ledger: that ledger is append-only academic evidence, and every
// LearningPathId declared in it is REQUIRED by verifyLearningPathReceipts. A lane that is legitimately
// idle would have no valid receipt and would block aggregate Production verification, and therefore
// graduation. Operational status must never be able to do that, so it lives in its own last-write-wins
// table and is read by humans, never by a gate.
//
// Recording is best effort by design: a lane must not fail because its status write failed. That is the
// opposite of the rule for evidence, and deliberately so -- this table proves nothing.

export type CosLaneOutcome = 'worked' | 'skipped' | 'failed'

export const COS_LANE_STATUS_FUNCTION = 'record_cos_lane_status' as const

function text(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/**
 * Detail is operational context only. Never put prompts, answers, credentials or provider bodies here:
 * this table is not covered by the assurance ledger's redaction review.
 */
function safeDetail(detail: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!detail) return {}
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(detail)) {
    if (value === null || value === undefined) continue
    if (typeof value === 'number' && !Number.isFinite(value)) continue
    out[text(key, 60)] = typeof value === 'string' ? text(value, 300)
      : typeof value === 'number' || typeof value === 'boolean' ? value
      : text(JSON.stringify(value), 300)
  }
  return out
}

export function buildCosLaneStatusArgs(input: {
  lane: string
  outcome: CosLaneOutcome
  reason: string
  detail?: Record<string, unknown>
  deploymentId?: string
  commitSha?: string
}) {
  const lane = text(input.lane, 120)
  const reason = text(input.reason, 200)
  if (!lane) throw new Error('cos_lane_status_lane_missing')
  if (!reason) throw new Error('cos_lane_status_reason_missing')
  if (input.outcome !== 'worked' && input.outcome !== 'skipped' && input.outcome !== 'failed') {
    throw new Error('cos_lane_status_outcome_invalid')
  }
  return {
    p_lane: lane,
    p_outcome: input.outcome,
    p_reason: reason,
    p_detail: safeDetail(input.detail),
    p_deployment_id: text(input.deploymentId, 200) || null,
    p_commit_sha: text(input.commitSha, 80) || null,
  }
}

export async function recordCosLaneStatus(input: {
  db: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error?: unknown } | null> } | null
  lane: string
  outcome: CosLaneOutcome
  reason: string
  detail?: Record<string, unknown>
}): Promise<boolean> {
  if (!input.db) return false
  try {
    const args = buildCosLaneStatusArgs({
      ...input,
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || process.env.VERCEL_URL || '',
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || '',
    })
    const result = await input.db.rpc(COS_LANE_STATUS_FUNCTION, args)
    if (result?.error) {
      console.error('[cos-lane-status]', JSON.stringify({ lane: input.lane, error: text((result.error as any)?.message, 300) }))
      return false
    }
    return true
  } catch (error) {
    // Never let an operational status write change what a lane does.
    console.error('[cos-lane-status]', JSON.stringify({
      lane: input.lane,
      error: text(error instanceof Error ? error.message : String(error), 300),
    }))
    return false
  }
}
