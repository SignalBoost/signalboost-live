import { rankEnterpriseGoals } from './goal-engine.ts'
import { buildEnterpriseGoalPlan } from './planner.ts'
import { getEnterpriseRole, recommendEnterpriseRoles } from './roles.ts'
import type { EnterpriseAiOsInput, EnterpriseAiOsSnapshot } from './types.ts'

function tenantKey(tenant: EnterpriseAiOsInput['tenant']): string { return `${tenant.tenantId}:${tenant.environmentId}` }

export function buildEnterpriseAiOsSnapshot(input: EnterpriseAiOsInput): EnterpriseAiOsSnapshot {
  if (!input.tenant.tenantId || !input.tenant.environmentId) throw new Error('tenant_required')
  for (const goal of input.goals) if (tenantKey(goal.tenant)!==tenantKey(input.tenant)) throw new Error('goal_tenant_boundary_violation')
  const generatedAt = input.generatedAt || new Date().toISOString()
  if (!Number.isFinite(Date.parse(generatedAt))) throw new Error('invalid_generated_at')
  const evaluations = rankEnterpriseGoals(input.goals,input.revenueSignals || [],input.maxGoals || 32)
  const selectedIds = new Set(evaluations.map(item=>item.goalId))
  const selectedGoals = input.goals.filter(goal=>selectedIds.has(goal.goalId))
  const plan = buildEnterpriseGoalPlan({ tenant:input.tenant, goals:selectedGoals, evaluations, generatedAt, maxSteps:input.maxSteps })
  const recommendedRoleIds = [...new Set(selectedGoals.flatMap(goal => goal.roleId ? [goal.roleId] : recommendEnterpriseRoles(`${goal.title} ${goal.metrics.map(metric=>metric.metric).join(' ')}`)))]
  const recommendedSkillIds = [...new Set(recommendedRoleIds.flatMap(roleId=>getEnterpriseRole(roleId).skillIds).concat(selectedGoals.flatMap(goal=>goal.requiredSkillIds)))].sort()
  const evidenceRefs = [...new Set([...(input.revenueSignals || []).flatMap(signal=>signal.evidenceRefs),...evaluations.flatMap(item=>item.evidenceRefs)])].sort()
  return Object.freeze({ schemaVersion:'1.0.0' as const, tenant:Object.freeze({...input.tenant}), generatedAt, evaluations:Object.freeze(evaluations), plan, recommendedRoleIds:Object.freeze(recommendedRoleIds), recommendedSkillIds:Object.freeze(recommendedSkillIds), evidenceRefs:Object.freeze(evidenceRefs) })
}
