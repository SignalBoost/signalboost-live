import type { TenantContext } from '@/lib/autonomous-systems/types.ts'
import { getEnterpriseRole, recommendEnterpriseRoles } from './roles.ts'
import { resolveEnterpriseSkills } from './skill-registry.ts'
import type { EnterpriseGoal, EnterpriseGoalPlan, EnterprisePlanStep, GoalEvaluation } from './types.ts'

function hash(text: string): string { let h=2166136261; for(const char of text){h^=char.charCodeAt(0);h=Math.imul(h,16777619)} return (h>>>0).toString(16).padStart(8,'0') }
function tenantKey(t: TenantContext): string { return `${t.tenantId}:${t.environmentId}` }

export function buildEnterpriseGoalPlan(args: {
  tenant: TenantContext
  goals: readonly EnterpriseGoal[]
  evaluations: readonly GoalEvaluation[]
  generatedAt: string
  maxSteps?: number
}): EnterpriseGoalPlan {
  const maxSteps = args.maxSteps ?? 64
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 256) throw new Error('invalid_max_steps')
  const evaluations = new Map(args.evaluations.map(item=>[item.goalId,item]))
  const active = args.goals.filter(goal => evaluations.has(goal.goalId) && evaluations.get(goal.goalId)?.status !== 'completed')
  for (const goal of active) if (tenantKey(goal.tenant)!==tenantKey(args.tenant)) throw new Error('goal_tenant_boundary_violation')

  const roleIds = [...new Set(active.flatMap(goal => goal.roleId ? [goal.roleId] : recommendEnterpriseRoles(`${goal.title} ${goal.metrics.map(metric=>metric.metric).join(' ')}`)))]
  const steps: EnterprisePlanStep[] = []
  const blockedGoalIds: string[] = []
  for (const goal of active) {
    if (goal.status === 'blocked') { blockedGoalIds.push(goal.goalId); continue }
    const role = getEnterpriseRole(goal.roleId || recommendEnterpriseRoles(goal.title)[0])
    const skillIds = [...new Set([...role.skillIds, ...goal.requiredSkillIds])]
    const skills = resolveEnterpriseSkills(skillIds)
    let previous: string | null = null
    for (const skill of skills) {
      const stepId = `eao_step_${hash(`${goal.goalId}:${skill.skillId}`)}`
      steps.push({
        stepId,
        ordinal: 0,
        goalId: goal.goalId,
        skillId: skill.skillId,
        capabilityIds: skill.capabilityIds,
        hubIds: skill.hubIds,
        dependsOn: previous ? [previous] : [],
        requiresApproval: skill.requiredApproval,
        mutating: skill.mutating,
      })
      previous = stepId
    }
  }
  const limited = steps.slice(0,maxSteps).map((step,index)=>({...step,ordinal:index+1}))
  const evidenceRefs = [...new Set(args.evaluations.flatMap(item=>item.evidenceRefs))].sort()
  const planBase = `${tenantKey(args.tenant)}:${args.generatedAt}:${limited.map(step=>step.stepId).join(',')}`
  return Object.freeze({
    schemaVersion: '1.0.0' as const,
    planId: `enterprise_goal_plan_${hash(planBase)}`,
    tenant: Object.freeze({...args.tenant}),
    generatedAt: args.generatedAt,
    goalIds: active.map(goal=>goal.goalId),
    roleIds,
    steps: Object.freeze(limited.map(step=>Object.freeze({...step,dependsOn:Object.freeze([...step.dependsOn]),capabilityIds:Object.freeze([...step.capabilityIds]),hubIds:Object.freeze([...step.hubIds])}))),
    blockedGoalIds: Object.freeze(blockedGoalIds.sort()),
    evidenceRefs: Object.freeze(evidenceRefs),
    executable: false as const,
  })
}
