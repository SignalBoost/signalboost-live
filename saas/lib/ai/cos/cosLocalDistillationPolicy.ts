export type LocalDistillationStatus =
  | 'trained_pending_rollback'
  | 'evaluation_pending'
  | 'runtime_pending'
  | 'active'
  | 'quarantined'
  | 'retired'

function clean(value: unknown, limit = 40): string {
  return String(value ?? '').trim().slice(0, limit)
}

/**
 * Local artifact ownership begins at training completion; Production traffic remains separately gated.
 * This pure policy is intentionally provider-neutral and contains no dispatch or billing behavior.
 */
export function decideLocalDistillationLifecycle(graduateStatusInput: unknown, rollbackReady: boolean) {
  const graduateStatus = clean(graduateStatusInput)
  const status: LocalDistillationStatus = graduateStatus === 'active'
    ? 'active'
    : graduateStatus === 'quarantined'
      ? 'quarantined'
      : graduateStatus === 'retired'
        ? 'retired'
        : graduateStatus === 'pending_runtime' || graduateStatus === 'canary'
          ? 'runtime_pending'
          : rollbackReady
            ? 'evaluation_pending'
            : 'trained_pending_rollback'
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
