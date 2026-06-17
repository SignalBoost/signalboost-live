// saas/lib/hub/elevatedPolicy.ts
//
// Elevated Privilege Mode (owner-only, per-request). Maps each action onto a tier
// and decides whether it auto-executes or routes to the approval queue. The gate
// is NEVER removed — elevated mode only lowers approval FRICTION for low/medium
// writes; high-risk/destructive actions always require approval, and a hard
// "blocked" policy is converted into a clean needs_approval entry, not a dead-end.

import { getHubActionPolicy, type HubActionPolicy } from '@/lib/hub/action-policy'

export type ElevatedTier = 'read_only' | 'low_medium_write' | 'high_risk'

export interface ElevatedDecision {
  tier: ElevatedTier
  decision: 'auto_execute' | 'needs_approval'
  autoApproved: boolean
  auditRequired: boolean
  reason: string
}

export function classifyElevated(
  policyActionId: string,
  opts: { elevated: boolean; isOwner: boolean },
): ElevatedDecision {
  const policy: HubActionPolicy = getHubActionPolicy(policyActionId)
  // Elevation is honored for the OWNER only. A non-owner sending elevated:true is ignored.
  const elevated = opts.elevated && opts.isOwner

  // 1) READ-ONLY → always auto-execute (no elevation needed).
  if (policy.level === 'read' || policy.approval === 'none') {
    return {
      tier: 'read_only', decision: 'auto_execute', autoApproved: false,
      auditRequired: policy.auditRequired, reason: 'Read-only action — auto-executed.',
    }
  }

  // 3) HIGH-RISK / DESTRUCTIVE → never auto-execute, even when elevated.
  //    Route cleanly into the approval queue instead of returning a hard block.
  const highRisk =
    policy.risk === 'high' || policy.risk === 'critical' ||
    policy.approval === 'owner_with_audit' || policy.approval === 'blocked'
  if (highRisk) {
    return {
      tier: 'high_risk', decision: 'needs_approval', autoApproved: false, auditRequired: true,
      reason: 'High-risk or destructive action — approval required even in elevated mode.',
    }
  }

  // 2) LOW / MEDIUM WRITE.
  if (elevated) {
    return {
      tier: 'low_medium_write', decision: 'auto_execute', autoApproved: true, auditRequired: true,
      reason: 'Low/medium write auto-approved under owner elevated mode (audited).',
    }
  }
  return {
    tier: 'low_medium_write', decision: 'needs_approval', autoApproved: false, auditRequired: true,
    reason: 'Low/medium write requires approval (elevated mode not active).',
  }
}
