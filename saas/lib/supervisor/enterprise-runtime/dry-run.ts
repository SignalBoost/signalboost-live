import type { SerializableValue } from '../incident-schema.ts'
import { assertDryRunCapable, type EnterpriseProviderDescriptor } from './provider-capabilities.ts'

export interface DryRunRequest {
  requestId: string
  targetResourceUrn: string
  params: Record<string, SerializableValue>
  shadowTargetFactory?: (targetResourceUrn: string) => string
}

export interface DryRunResult {
  passedSimulation: boolean
  predictedMetrics: Record<string, number>
  errors: string[]
  snapshotId?: string
}

export class DryRunEngine {
  async simulate(request: DryRunRequest, provider: EnterpriseProviderDescriptor): Promise<DryRunResult> {
    assertDryRunCapable(provider)
    const target = request.shadowTargetFactory?.(request.targetResourceUrn) ?? `${request.targetResourceUrn}:shadow`
    const planning = await provider.planner.validatePlan(target, request.params)
    if (!planning.allowed) return { passedSimulation: false, predictedMetrics: {}, errors: [planning.reason] }

    const snapshot = await provider.snapshots.checkpoint(target)
    try {
      const execution = await provider.mutations.execute(target, request.params)
      if (!execution.success) return { passedSimulation: false, predictedMetrics: {}, errors: ['Shadow execution returned failure'], snapshotId: snapshot.snapshotId }
      const verification = await provider.verification.verify(target)
      return {
        passedSimulation: verification.healthy,
        predictedMetrics: verification.metrics,
        errors: verification.assertionFailures,
        snapshotId: snapshot.snapshotId,
      }
    } finally {
      const rollback = await provider.rollback.rollback(snapshot)
      if (!rollback.restored) throw new Error('Dry-run environment could not be restored after simulated mutation')
    }
  }
}
