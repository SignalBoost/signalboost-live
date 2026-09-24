import type { HarnessManifest } from '../core/types.ts'
import type { HarnessAction } from './governed-executor.ts'

export interface HarnessCostReservation {
  allowed: boolean
  reservedCostUsd: number
  evidenceRef?: string
  reason?: string
}

/**
 * Host-owned hard-spend reservation boundary.
 *
 * The worker never supplies its own price. When a Harness manifest contains maxCostUsd,
 * the host must reserve a worst-case upper bound before execution. The Harness treats the
 * reservation as consumed budget even when actual provider spend is lower; later settlement
 * may improve utilization, but it may never weaken the hard ceiling.
 */
export interface HarnessCostBudgetPort {
  reserve(input: {
    manifest: HarnessManifest
    action: HarnessAction
    remainingCostUsd: number
  }): Promise<HarnessCostReservation>
}
