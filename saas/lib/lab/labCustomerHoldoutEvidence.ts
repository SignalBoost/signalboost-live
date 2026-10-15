import type { HoldoutScore } from './labCustomerHoldoutScore.ts'
import type { HoldoutLeakage } from './labCustomerHoldoutLeakage.ts'

/** Portable, intentionally self-reported evaluation summary: never a provider-verified result. */
export function customerHoldoutEvidence(input: {
 runId: string; baseModel: string; trainedModel: string; score: HoldoutScore; leakage: HoldoutLeakage
}) {
 if (!input.leakage.safeToScore || input.leakage.evaluationPrompts !== input.score.total)
  throw new Error('holdout_evidence_unverified')
 if (!input.runId.trim() || !input.baseModel.trim() || !input.trainedModel.trim())
  throw new Error('holdout_evidence_model_missing')
 return Object.freeze({
  schema: 'itmounts.customer_holdout_exact_match.v1',
  trainingRunId: input.runId,
  models: {base: input.baseModel, trained: input.trainedModel},
  method: 'customer_supplied_outputs_exact_match_case_insensitive_whitespace_normalized',
  execution: 'no_provider_inference_performed',
  provenance: 'customer_supplied_not_independently_verified',
  overlapCheck: 'exact_normalized_prompts_only_not_semantic_leakage',
  count: input.score.total,
  baseCorrect: input.score.baseCorrect,
  trainedCorrect: input.score.trainedCorrect,
  baseAccuracy: input.score.baseAccuracy,
  trainedAccuracy: input.score.trainedAccuracy,
  delta: input.score.delta,
  limitations: 'No independence, model identity, factual quality, or general improvement certification; no raw prompts or outputs exported.',
 })
}
