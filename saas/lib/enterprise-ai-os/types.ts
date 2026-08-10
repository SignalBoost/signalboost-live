import type { TenantContext } from '@/lib/autonomous-systems/types.ts'
import type { RevenueOptimizationSignal } from '@/lib/revenue/hub/signals.ts'

export const ENTERPRISE_AI_OS_SCHEMA_VERSION = '1.0.0' as const

export type EnterpriseGoalStatus = 'draft' | 'active' | 'blocked' | 'completed' | 'cancelled'
export type EnterpriseGoalMetricDirection = 'increase' | 'decrease' | 'maintain'
export type EnterpriseRoleId = 'ai_sdr' | 'ai_marketing_director' | 'ai_revenue_operations' | 'ai_customer_success' | 'ai_sales_manager'
export type EnterpriseHubId = 'communication' | 'crm' | 'prospect' | 'revenue' | 'universal_adapter'

export interface EnterpriseGoalMetric {
  readonly metric: string
  readonly target: number
  readonly direction: EnterpriseGoalMetricDirection
  readonly weight: number
  readonly currency?: string
}

export interface EnterpriseGoal {
  readonly schemaVersion: typeof ENTERPRISE_AI_OS_SCHEMA_VERSION
  readonly goalId: string
  readonly tenant: TenantContext
  readonly title: string
  readonly status: EnterpriseGoalStatus
  readonly priority: number
  readonly metrics: readonly EnterpriseGoalMetric[]
  readonly constraints: readonly string[]
  readonly requiredSkillIds: readonly string[]
  readonly roleId?: EnterpriseRoleId
  readonly deadline?: string
  readonly createdAt: string
}

export interface EnterpriseSkill {
  readonly skillId: string
  readonly title: string
  readonly description: string
  readonly capabilityIds: readonly string[]
  readonly hubIds: readonly EnterpriseHubId[]
  readonly requiredApproval: boolean
  readonly mutating: boolean
  readonly inputs: readonly string[]
  readonly outputs: readonly string[]
  readonly tags: readonly string[]
}

export interface EnterpriseRole {
  readonly roleId: EnterpriseRoleId
  readonly title: string
  readonly goalPatterns: readonly string[]
  readonly skillIds: readonly string[]
  readonly hubIds: readonly EnterpriseHubId[]
}

export interface GoalProgressMetric {
  readonly metric: string
  readonly target: number
  readonly actual: number | null
  readonly progress: number | null
  readonly satisfied: boolean
  readonly currency?: string
}

export interface GoalEvaluation {
  readonly goalId: string
  readonly score: number
  readonly status: EnterpriseGoalStatus
  readonly metricProgress: readonly GoalProgressMetric[]
  readonly reasons: readonly string[]
  readonly evidenceRefs: readonly string[]
}

export interface EnterprisePlanStep {
  readonly stepId: string
  readonly ordinal: number
  readonly goalId: string
  readonly skillId: string
  readonly capabilityIds: readonly string[]
  readonly hubIds: readonly EnterpriseHubId[]
  readonly dependsOn: readonly string[]
  readonly requiresApproval: boolean
  readonly mutating: boolean
}

export interface EnterpriseGoalPlan {
  readonly schemaVersion: typeof ENTERPRISE_AI_OS_SCHEMA_VERSION
  readonly planId: string
  readonly tenant: TenantContext
  readonly generatedAt: string
  readonly goalIds: readonly string[]
  readonly roleIds: readonly EnterpriseRoleId[]
  readonly steps: readonly EnterprisePlanStep[]
  readonly blockedGoalIds: readonly string[]
  readonly evidenceRefs: readonly string[]
  readonly executable: false
}

export interface EnterpriseAiOsInput {
  readonly tenant: TenantContext
  readonly goals: readonly EnterpriseGoal[]
  readonly revenueSignals?: readonly RevenueOptimizationSignal[]
  readonly generatedAt?: string
  readonly maxGoals?: number
  readonly maxSteps?: number
}

export interface EnterpriseAiOsSnapshot {
  readonly schemaVersion: typeof ENTERPRISE_AI_OS_SCHEMA_VERSION
  readonly tenant: TenantContext
  readonly generatedAt: string
  readonly evaluations: readonly GoalEvaluation[]
  readonly plan: EnterpriseGoalPlan
  readonly recommendedRoleIds: readonly EnterpriseRoleId[]
  readonly recommendedSkillIds: readonly string[]
  readonly evidenceRefs: readonly string[]
}
