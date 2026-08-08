import type { CosLeadershipTickResult } from './leaderRuntime.ts'
import type { CosMission } from './missionDirector.ts'

export type CosMissionLifecycleStatus =
  | 'INITIALIZED'
  | 'DIAGNOSING'
  | 'ACTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'WAITING_FOR_APPROVAL'
  | 'BLOCKED_BY_GOVERNANCE'
  | 'BLOCKED_MISSING_CREDENTIAL'
  | 'BLOCKED_EXCEEDED_BUDGET'
  | 'FAILED_UNRECOVERABLE'

export interface CosMissionCompletionPolicy {
  requireVerifiedGoal?: boolean
  requireEvidence?: boolean
  requiredCheckpoints?: readonly string[]
}

export interface CosMissionLifecycleEvent {
  at: string
  iteration: number
  status: CosMissionLifecycleStatus
  kind: 'tick' | 'transition' | 'checkpoint' | 'block' | 'complete'
  summary: string
}

export interface CosMissionLifecycleState {
  schemaVersion: 'cos-mission-lifecycle-v1'
  missionId: string
  objective: string
  status: CosMissionLifecycleStatus
  iteration: number
  maxIterations: number
  consecutiveFailures: number
  maxConsecutiveFailures: number
  evidenceIds: readonly string[]
  checkpoints: Readonly<Record<string, boolean>>
  completionPolicy: CosMissionCompletionPolicy
  history: readonly CosMissionLifecycleEvent[]
  lastSummary: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  blockedReason?: string
}

export interface CosMissionLifecycleOptions {
  maxIterations?: number
  maxConsecutiveFailures?: number
  completionPolicy?: CosMissionCompletionPolicy
}

const TERMINAL = new Set<CosMissionLifecycleStatus>([
  'COMPLETED',
  'BLOCKED_BY_GOVERNANCE',
  'BLOCKED_MISSING_CREDENTIAL',
  'BLOCKED_EXCEEDED_BUDGET',
  'FAILED_UNRECOVERABLE',
])

export function isTerminalMissionStatus(status: CosMissionLifecycleStatus): boolean {
  return TERMINAL.has(status)
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value as number)))
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function appendHistory(
  history: readonly CosMissionLifecycleEvent[],
  event: CosMissionLifecycleEvent,
): readonly CosMissionLifecycleEvent[] {
  return [...history, event].slice(-100)
}

export function createMissionLifecycleState(
  mission: CosMission,
  options: CosMissionLifecycleOptions = {},
): CosMissionLifecycleState {
  const now = new Date().toISOString()
  return {
    schemaVersion: 'cos-mission-lifecycle-v1',
    missionId: mission.missionId,
    objective: mission.purpose,
    status: 'INITIALIZED',
    iteration: 0,
    maxIterations: boundedInt(options.maxIterations, 30, 1, 500),
    consecutiveFailures: 0,
    maxConsecutiveFailures: boundedInt(options.maxConsecutiveFailures, 5, 1, 50),
    evidenceIds: [],
    checkpoints: {},
    completionPolicy: {
      requireVerifiedGoal: options.completionPolicy?.requireVerifiedGoal !== false,
      requireEvidence: options.completionPolicy?.requireEvidence !== false,
      requiredCheckpoints: unique(options.completionPolicy?.requiredCheckpoints ?? []),
    },
    history: [{
      at: now,
      iteration: 0,
      status: 'INITIALIZED',
      kind: 'transition',
      summary: 'Mission persisted. COS owns the objective until deterministic completion or an explicit block.',
    }],
    lastSummary: 'Mission initialized.',
    createdAt: now,
    updatedAt: now,
  }
}

export function deterministicCompletionSatisfied(state: CosMissionLifecycleState): boolean {
  const policy = state.completionPolicy
  if (policy.requireVerifiedGoal !== false && state.checkpoints.goal_verified !== true) return false
  if (policy.requireEvidence !== false && state.evidenceIds.length === 0) return false
  for (const checkpoint of policy.requiredCheckpoints ?? []) {
    if (state.checkpoints[checkpoint] !== true) return false
  }
  return true
}

export function setMissionCheckpoint(
  state: CosMissionLifecycleState,
  checkpoint: string,
  satisfied = true,
  summary?: string,
): CosMissionLifecycleState {
  const key = String(checkpoint || '').trim()
  if (!key || isTerminalMissionStatus(state.status)) return state
  const now = new Date().toISOString()
  const checkpointEvent: CosMissionLifecycleEvent = {
    at: now,
    iteration: state.iteration,
    status: state.status,
    kind: 'checkpoint',
    summary: summary || `${key}=${satisfied}`,
  }
  let next: CosMissionLifecycleState = {
    ...state,
    checkpoints: { ...state.checkpoints, [key]: satisfied },
    history: appendHistory(state.history, checkpointEvent),
    updatedAt: now,
  }
  if (deterministicCompletionSatisfied(next)) {
    const completeEvent: CosMissionLifecycleEvent = {
      at: now,
      iteration: next.iteration,
      status: 'COMPLETED',
      kind: 'complete',
      summary: 'All required deterministic completion criteria are satisfied.',
    }
    next = {
      ...next,
      status: 'COMPLETED',
      completedAt: now,
      lastSummary: summary || 'All required deterministic completion checkpoints are satisfied.',
      history: appendHistory(next.history, completeEvent),
    }
  }
  return next
}

function statusForActiveTick(result: CosLeadershipTickResult): CosMissionLifecycleStatus {
  if (result.actionRun) return 'VERIFYING'
  if (result.decision.shouldAct) return 'ACTING'
  return 'DIAGNOSING'
}

export function applyMissionTick(
  previous: CosMissionLifecycleState,
  result: CosLeadershipTickResult,
): CosMissionLifecycleState {
  if (isTerminalMissionStatus(previous.status)) return previous

  const now = new Date().toISOString()
  const iteration = previous.iteration + 1
  const evidenceIds = unique([
    ...previous.evidenceIds,
    ...result.observed.evidenceIds,
    ...(result.actionRun?.cycles.flatMap(cycle => [
      ...cycle.observation.evidenceIds,
      ...(cycle.results?.flatMap(item => item.evidenceIds ?? []) ?? []),
      ...(cycle.verification?.evidenceIds ?? []),
    ]) ?? []),
  ])

  const checkpoints: Record<string, boolean> = { ...previous.checkpoints }
  if (result.observed.evidenceIds.length > 0) checkpoints.observation_grounded = true
  if (result.actionRun?.cycles.some(cycle => cycle.results?.some(item => item.status === 'completed'))) checkpoints.action_completed = true
  if (result.actionRun?.cycles.some(cycle => cycle.verification?.status === 'verified')) checkpoints.verification_passed = true
  if (result.actionRun?.cycles.some(cycle => cycle.verification?.goalSatisfied === true)) checkpoints.goal_verified = true

  let status = statusForActiveTick(result)
  let blockedReason: string | undefined
  let consecutiveFailures = previous.consecutiveFailures
  const stopReason = result.actionRun?.stopReason

  if (stopReason === 'approval_required') {
    status = 'WAITING_FOR_APPROVAL'
    blockedReason = result.actionRun?.summary || 'Human approval is required.'
  } else if (stopReason === 'kill_switch' || stopReason === 'blocked') {
    status = 'BLOCKED_BY_GOVERNANCE'
    blockedReason = result.actionRun?.summary || result.summary
  } else if (stopReason === 'adapter_failure') {
    consecutiveFailures += 1
    status = 'DIAGNOSING'
  } else if (stopReason === 'max_cycles' || stopReason === 'max_failures' || stopReason === 'no_progress') {
    consecutiveFailures += 1
  } else if (result.actionRun?.status === 'completed') {
    consecutiveFailures = 0
  }

  if (iteration >= previous.maxIterations || consecutiveFailures >= previous.maxConsecutiveFailures) {
    status = 'BLOCKED_EXCEEDED_BUDGET'
    blockedReason = iteration >= previous.maxIterations
      ? `Mission exceeded ${previous.maxIterations} re-entrant ticks without satisfying completion criteria.`
      : `Mission reached ${previous.maxConsecutiveFailures} consecutive failed/no-progress ticks.`
  }

  const tickEvent: CosMissionLifecycleEvent = {
    at: now,
    iteration,
    status,
    kind: blockedReason ? 'block' : 'tick',
    summary: result.summary,
  }
  let next: CosMissionLifecycleState = {
    ...previous,
    status,
    iteration,
    consecutiveFailures,
    evidenceIds,
    checkpoints,
    lastSummary: result.summary,
    blockedReason,
    updatedAt: now,
    history: appendHistory(previous.history, tickEvent),
  }

  if (!blockedReason && deterministicCompletionSatisfied(next)) {
    const completeEvent: CosMissionLifecycleEvent = {
      at: now,
      iteration,
      status: 'COMPLETED',
      kind: 'complete',
      summary: 'All required deterministic completion criteria are satisfied.',
    }
    next = {
      ...next,
      status: 'COMPLETED',
      completedAt: now,
      lastSummary: `Mission completed by deterministic gate. ${result.summary}`,
      history: appendHistory(next.history, completeEvent),
    }
  }

  return next
}
