import { massDistilledRuntimeHealth } from './runpodMassDistilledProvision.ts'

export const MASS_EVALUATION_RUNTIME_HEALTH_PROFILE = 'cos_mass_evaluation_runtime_health_v1' as const

export function isMassEvaluationCandidateGatewayFailure(message: unknown): boolean {
  return /^mass_distilled_evaluation_runpod_http_(502|503|504):candidate:/.test(String(message ?? ''))
}

export async function captureMassEvaluationRuntimeHealth(input: {
  endpointId: string
  gatewayFailure: string
  observedAt?: Date
}) {
  if (!isMassEvaluationCandidateGatewayFailure(input.gatewayFailure)) return null
  const health = await massDistilledRuntimeHealth(input.endpointId)
  return Object.freeze({
    profile: MASS_EVALUATION_RUNTIME_HEALTH_PROFILE,
    source: 'runpod_serverless_health_control_plane' as const,
    observedAt: (input.observedAt || new Date()).toISOString(),
    endpointId: input.endpointId,
    gatewayFailure: String(input.gatewayFailure).slice(0, 500),
    health,
    inferenceCallsAdded: 0,
    runtimeWakeAttemptsAdded: 0,
    productionTrafficAuthorized: false,
    authorityExpanded: false,
  })
}
