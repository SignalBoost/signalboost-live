import type { CosAutonomyGuard, CosProposedAction, PortableManifest } from './types.ts'
import { actionCapability } from './runtime.ts'

/**
 * Deterministic baseline admission for COS autonomy. Buyers can wrap/replace this with
 * their PolicyEngine/quorum layer, but AI output alone can never grant authority here.
 */
export function createCapabilityGuard(input?: {
  killSwitch?: () => Promise<boolean> | boolean
  allowLowRiskReversibleWithoutApproval?: boolean
}): CosAutonomyGuard {
  return {
    isKillSwitchEngaged: () => input?.killSwitch?.() ?? false,
    authorize({ manifest, action }: { manifest: PortableManifest; action: CosProposedAction }) {
      const capability = actionCapability(manifest, action)
      if (capability.riskClass === 'forbidden') return { outcome: 'blocked' as const, reason: `Capability ${capability.capabilityId} is forbidden.` }
      if (capability.requiresApproval) return { outcome: 'approval_required' as const, reason: `Capability ${capability.capabilityId} requires approval.` }
      if (capability.readOnly) return { outcome: 'approved' as const, reason: 'Read-only capability admitted.' }
      if (capability.riskClass === 'low_risk_reversible' && input?.allowLowRiskReversibleWithoutApproval) {
        return { outcome: 'approved' as const, reason: 'Buyer policy permits low-risk reversible autonomous execution.' }
      }
      return { outcome: 'approval_required' as const, reason: `Mutating capability ${capability.capabilityId} is not pre-authorized for autonomous execution.` }
    },
  }
}
