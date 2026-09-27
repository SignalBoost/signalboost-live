import { builderTaskContract, type BuilderTaskContract } from './task-contract.ts'
import type { BuilderToolTrace } from './contracts.ts'

export type BuilderGoalState = 'planning' | 'executing' | 'verifying' | 'production_acceptance' | 'satisfied' | 'blocked'

export type BuilderEngineeringGoal = Readonly<{
  objective: string
  acceptance: BuilderTaskContract
  requiresProductionAcceptance: boolean
}>

export type BuilderEngineeringControlState = Readonly<{
  goal: BuilderEngineeringGoal
  state: BuilderGoalState
  evidence: readonly string[]
  remaining: readonly string[]
}>

export function builderEngineeringGoal(objective: string): BuilderEngineeringGoal {
  const acceptance = builderTaskContract(objective)
  return Object.freeze({
    objective: String(objective || '').trim().slice(0, 8_000),
    acceptance,
    requiresProductionAcceptance: /\b(?:production|deploy|deployed|live|website|site|vercel)\b/i.test(objective),
  })
}

export function builderEngineeringControlState(input: {
  objective: string
  paths: readonly string[]
  trace: readonly BuilderToolTrace[]
  productionAccepted?: boolean
}): BuilderEngineeringControlState {
  const goal = builderEngineeringGoal(input.objective)
  const evidence: string[] = []
  const remaining: string[] = []
  for (const path of goal.acceptance.files) {
    if (input.paths.includes(path)) evidence.push(`file:${path}`)
    else remaining.push(`file:${path}`)
  }
  const successfulRuns = input.trace.filter(item => item.toolId === 'run' && item.ok)
  if (successfulRuns.length) evidence.push(`successful_runs:${successfulRuns.length}`)
  if (goal.acceptance.requiresRun && !successfulRuns.length) remaining.push('runtime_verification')
  if (goal.requiresProductionAcceptance) {
    if (input.productionAccepted) evidence.push('production_acceptance')
    else remaining.push('production_acceptance')
  }
  const changed = input.trace.some(item => item.ok && (item.toolId === 'write_file' || item.toolId === 'edit_file'))
  const state: BuilderGoalState = remaining.length === 0
    ? 'satisfied'
    : goal.requiresProductionAcceptance && remaining.every(item => item === 'production_acceptance')
      ? 'production_acceptance'
      : changed ? 'verifying' : input.trace.length ? 'executing' : 'planning'
  return Object.freeze({ goal, state, evidence: Object.freeze(evidence), remaining: Object.freeze(remaining) })
}

export function formatBuilderEngineeringGoal(goal: BuilderEngineeringGoal): string {
  return [
    'ENGINEERING GOAL CONTRACT:',
    `Outcome: ${goal.objective}`,
    `Required files: ${goal.acceptance.files.join(', ') || 'derived from current repository evidence'}`,
    `Required commands: ${goal.acceptance.commands.join(' ; ') || (goal.acceptance.requiresRun ? 'at least one proving run' : 'none explicitly requested')}`,
    `Production acceptance: ${goal.requiresProductionAcceptance ? 'required' : 'not implied by this request'}`,
    'Do not claim completion while any acceptance item remains unproved. Current-state evidence outranks plans, prior chats, and model assertions.',
  ].join('\n')
}
