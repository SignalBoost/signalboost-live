import type { RevenueOptimizationSignal } from '@/lib/revenue/hub/signals.ts'
import type { EnterpriseGoal, GoalEvaluation, GoalProgressMetric } from './types.ts'

function signalKey(signal: RevenueOptimizationSignal): string {
  return `${signal.metric}:${signal.currency || ''}`
}

function progress(actual: number, target: number, direction: 'increase'|'decrease'|'maintain'): number {
  if (direction === 'increase') return target === 0 ? (actual >= 0 ? 1 : 0) : Math.max(0, Math.min(1, actual / target))
  if (direction === 'decrease') return actual <= target ? 1 : target <= 0 ? 0 : Math.max(0, Math.min(1, target / actual))
  if (target === 0) return actual === 0 ? 1 : 0
  return Math.max(0, 1 - Math.abs(actual-target)/Math.abs(target))
}

export function evaluateEnterpriseGoal(goal: EnterpriseGoal, signals: readonly RevenueOptimizationSignal[] = []): GoalEvaluation {
  if (!goal.goalId || !goal.tenant.tenantId || !goal.tenant.environmentId) throw new Error('invalid_goal')
  if (!Number.isInteger(goal.priority) || goal.priority < 0 || goal.priority > 1000) throw new Error('invalid_goal_priority')
  const map = new Map(signals.map(signal => [signalKey(signal), signal]))
  const metrics: GoalProgressMetric[] = goal.metrics.map(metric => {
    if (!Number.isFinite(metric.target) || !Number.isFinite(metric.weight) || metric.weight < 0 || metric.weight > 1) throw new Error('invalid_goal_metric')
    const signal = map.get(`${metric.metric}:${metric.currency || ''}`)
    const actual = signal?.value ?? null
    const measured = actual === null ? null : progress(actual, metric.target, metric.direction)
    return { metric: metric.metric, target: metric.target, actual, progress: measured, satisfied: measured !== null && measured >= 0.999, ...(metric.currency ? { currency: metric.currency } : {}) }
  })
  const measured = metrics.filter(metric => metric.progress !== null)
  const weighted = measured.reduce((sum, metric) => {
    const source = goal.metrics.find(candidate => candidate.metric===metric.metric && (candidate.currency||'')===(metric.currency||''))
    return sum + (metric.progress || 0) * (source?.weight || 0)
  }, 0)
  const totalWeight = measured.reduce((sum, metric) => {
    const source = goal.metrics.find(candidate => candidate.metric===metric.metric && (candidate.currency||'')===(metric.currency||''))
    return sum + (source?.weight || 0)
  }, 0)
  const score = totalWeight > 0 ? weighted / totalWeight : 0
  const reasons = [measured.length ? 'business_outcomes_measured' : 'awaiting_business_outcomes']
  if (metrics.length && metrics.every(metric => metric.satisfied)) reasons.push('all_goal_metrics_satisfied')
  if (goal.deadline && Number.isFinite(Date.parse(goal.deadline)) && Date.parse(goal.deadline) < Date.now()) reasons.push('deadline_overdue')
  const evidenceRefs = [...new Set(signals.filter(signal => goal.metrics.some(metric => signalKey(signal)===`${metric.metric}:${metric.currency||''}`)).flatMap(signal=>signal.evidenceRefs))].sort()
  return { goalId: goal.goalId, score, status: metrics.length && metrics.every(metric=>metric.satisfied) ? 'completed' : goal.status, metricProgress: metrics, reasons, evidenceRefs }
}

export function rankEnterpriseGoals(goals: readonly EnterpriseGoal[], signals: readonly RevenueOptimizationSignal[] = [], maxGoals=32): readonly GoalEvaluation[] {
  if (!Number.isInteger(maxGoals) || maxGoals < 1 || maxGoals > 128) throw new Error('invalid_max_goals')
  return goals.map(goal => ({ goal, evaluation: evaluateEnterpriseGoal(goal, signals) }))
    .filter(item => item.goal.status === 'active' || item.goal.status === 'blocked')
    .sort((a,b) => (b.goal.priority + (1-b.evaluation.score)*100) - (a.goal.priority + (1-a.evaluation.score)*100) || a.goal.goalId.localeCompare(b.goal.goalId))
    .slice(0,maxGoals)
    .map(item=>item.evaluation)
}
