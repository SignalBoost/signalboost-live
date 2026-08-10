import { buildEnterpriseDecision, type EnterpriseDecisionSnapshot } from '@/lib/autonomous-systems/decision-engine.ts'
import type { TenantContext } from '@/lib/autonomous-systems/types.ts'
import type { EnterpriseGoal, EnterpriseGoalPlan } from './types.ts'

function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}` }

export function buildGoalPlanDecision(args: {
  tenant: TenantContext
  goals: readonly EnterpriseGoal[]
  plan: EnterpriseGoalPlan
  maxCandidates?: number
}): EnterpriseDecisionSnapshot {
  if (tenantKey(args.plan.tenant) !== tenantKey(args.tenant)) throw new Error('plan_tenant_boundary_violation')
  const priorities = new Map(args.goals.map(goal=>[goal.goalId,goal.priority]))
  const candidates = args.plan.steps.map(step => ({
    candidateId: step.stepId,
    tenant: args.tenant,
    objectiveId: step.goalId,
    objectivePriority: priorities.get(step.goalId) || 0,
    capabilityId: step.capabilityIds.join('+') || step.skillId,
    capabilityStatus: 'available' as const,
    policyEffect: step.requiresApproval ? 'require_review' as const : 'allow' as const,
    riskLevel: step.mutating ? 'medium' as const : 'low' as const,
    evidenceRefs: args.plan.evidenceRefs,
  }))
  return buildEnterpriseDecision({ tenant: args.tenant, candidates, maxCandidates: args.maxCandidates ?? Math.max(1, Math.min(256,candidates.length || 1)) })
}
