export const COS_WORKING_DISTILLATION_DISPATCH_PROFILE = 'cos-working-distillation-dispatch-v1' as const
export const COS_WORKING_DISTILLATION_TRAINING_MODE = 'working_cos_supervised_distillation' as const

export async function workingCosDispatchReadiness() {
  return { diagnosticStub: true, automaticTrainingAuthorized: false as const, productionTrafficAuthorized: false as const }
}

export async function dispatchWorkingCosDatasetPreparation(_input: { confirmDispatch: unknown; rotationSeed?: string }) {
  throw new Error('diagnostic_stub')
}

export async function dispatchWorkingCosTraining(_input: { confirmDispatch: unknown; rotationSeed?: string }) {
  throw new Error('diagnostic_stub')
}

export async function recordWorkingCosTrainingExecutorEvidence(
  _input: Record<string, unknown>,
  _binding: { idempotencyKey: string },
  _dbOverride?: any,
) {
  throw new Error('diagnostic_stub')
}
