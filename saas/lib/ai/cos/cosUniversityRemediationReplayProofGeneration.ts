// saas/lib/ai/cos/cosUniversityRemediationReplayProofGeneration.ts
//
// Proof cohorts must be generation-bound. Older post-GKD replay artifacts remain durable historical
// evidence, but they cannot satisfy the bounded proof quota for the remediation generation that first
// consumed curriculum selected by verified evaluation failure rather than curriculum shortfall.
//
// Production evidence: the first batch from that corrected generation was prepared at
// 2026-09-24T13:40:36Z. Use a stable boundary just before that batch so its artifacts and every later
// generation count, while Sept. 22 replay artifacts that proved the older recipe do not.
//
// This constant changes scheduling/proof accounting only. It does not shorten retention, bypass an
// exact-artifact canary, alter evaluator scoring, widen spend, authorize promotion, or authorize traffic.
export const MASS_REMEDIATION_REPLAY_PROOF_GENERATION_AFTER = '2026-09-24T13:40:00.000Z' as const

export function isCurrentMassRemediationReplayProofGeneration(createdAt: unknown): boolean {
  const value = Date.parse(String(createdAt || ''))
  const boundary = Date.parse(MASS_REMEDIATION_REPLAY_PROOF_GENERATION_AFTER)
  return Number.isFinite(value) && value >= boundary
}
