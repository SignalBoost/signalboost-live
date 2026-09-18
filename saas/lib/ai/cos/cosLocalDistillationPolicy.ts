export type LocalDistillationStatus =
  | 'trained_pending_rollback'
  | 'evaluation_pending'
  | 'runtime_pending'
  | 'active'
  | 'quarantined'
  | 'retired'

export type CompletedDistilledEvaluation = Readonly<{
  holdoutImproved: boolean
  safetyPassed: boolean
  unseenTransferPassed: boolean
  delayedRetentionPassed: boolean
  retentionEligible: boolean
}>

function clean(value: unknown, limit = 40): string {
  return String(value ?? '').trim().slice(0, limit)
}

/**
 * Local artifact ownership begins at training completion; Production traffic remains separately gated.
 * This pure policy is intentionally provider-neutral and contains no dispatch or billing behavior.
 */
export function decideLocalDistillationLifecycle(
  graduateStatusInput: unknown,
  rollbackReady: boolean,
  existingStatusInput?: unknown,
) {
  const graduateStatus = clean(graduateStatusInput)
  const existingStatus = clean(existingStatusInput)
  let status: LocalDistillationStatus = rollbackReady ? 'evaluation_pending' : 'trained_pending_rollback'
  if (existingStatus === 'quarantined' || existingStatus === 'runtime_pending') {
    status = existingStatus
  }
  if (graduateStatus === 'pending_runtime' || graduateStatus === 'canary') status = 'runtime_pending'
  if (graduateStatus === 'active' || graduateStatus === 'quarantined' || graduateStatus === 'retired') {
    status = graduateStatus
  }
  const nextGate = status === 'trained_pending_rollback'
    ? 'rollback_evidence'
    : status === 'evaluation_pending'
      ? 'independent_evaluation'
      : status === 'runtime_pending'
        ? 'runtime_binding_canary'
        : status
  return Object.freeze({
    status,
    nextGate,
    trafficAuthorized: status === 'active',
  })
}

/** A completed independent verdict leaves the evaluation queue exactly once. */
export function decideCompletedDistilledEvaluation(input: CompletedDistilledEvaluation) {
  const evaluationPassed = input.retentionEligible
    && input.holdoutImproved
    && input.safetyPassed
    && input.unseenTransferPassed
    && input.delayedRetentionPassed
  return Object.freeze({
    evaluationCompleted: input.retentionEligible,
    evaluationPassed,
    nextStatus: !input.retentionEligible
      ? 'evaluation_pending' as const
      : evaluationPassed
        ? 'runtime_pending' as const
        : 'quarantined' as const,
  })
}

export const LOCAL_DISTILLATION_STRATEGY = Object.freeze({
  owner: 'itmounts',
  canonicalStudentBase: 'Qwen/Qwen3-4B',
  artifactKind: 'lora_adapter',
  servingTopology: 'runpod_serverless_primary_deepinfra_fallback',
  capacityStrategy: 'serverless_multi_gpu_flex_no_fixed_pod_dependency',
  accumulation: 'many_scoped_adapters_then_optional_consolidation',
  productionRule: 'independent_evaluation_promotion_runtime_canary_required',
  providerIndependenceGoal: 'decrease_external_inference_dependency_over_time',
})
