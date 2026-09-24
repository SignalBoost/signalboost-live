// saas/lib/ai/cos/cosUniversityFailureDerivedReplayReceipt.ts
//
// The first post-GKD remediation replay existed before the strengthened recipe. Production
// evaluations of those older artifacts proved that 1 epoch at 2e-5 with only a handful of
// remediation rows was not enough to preserve authority/budget and evidence-attribution behavior.
//
// Proof scheduling must therefore distinguish "has some replay" from the strengthened recipe that
// is actually under test. This changes scheduling only; it never changes evaluation scores,
// thresholds, spend ceilings, promotion, or Production-traffic authority.

export const FAILURE_DERIVED_REPLAY_PROOF_MIN_EPOCHS = 3
export const FAILURE_DERIVED_REPLAY_PROOF_MIN_LEARNING_RATE = 5e-5

export function isStrengthenedFailureDerivedReplayReceipt(intendedUse: unknown): boolean {
  if (!intendedUse || typeof intendedUse !== 'object' || Array.isArray(intendedUse)) return false
  const receipt = (intendedUse as any).trainingReceipt
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false
  return receipt.failureDerivedReplayRequired === true
    && Number(receipt.failureDerivedReplayItems || 0) > 0
    && Number(receipt.failureDerivedReplayEpochs || 0) >= FAILURE_DERIVED_REPLAY_PROOF_MIN_EPOCHS
    && Number(receipt.failureDerivedReplayLearningRate || 0) >= FAILURE_DERIVED_REPLAY_PROOF_MIN_LEARNING_RATE
    && String(receipt.failureDerivedReplayTrainer || '') === 'SFTTrainer'
}
