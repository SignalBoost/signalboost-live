export type CosGoalCompletionStatus = 'done' | 'partial' | 'blocked'

export type CosGoalCompletionNextAction = 'deliver' | 'retry' | 'delegate' | 'ask_user' | 'wait'

/**
 * Safe, user-deliverable objective state. This is evidence about execution state,
 * not hidden reasoning or chain-of-thought.
 */
export type CosGoalCompletion = Readonly<{
  status: CosGoalCompletionStatus
  evidence: readonly string[]
  unresolved: readonly string[]
  recommended_next_action: CosGoalCompletionNextAction
  attempts?: number
}>

/**
 * Automatic replay is deliberately narrow. Read-only discovery and explicitly
 * idempotent operations may be retried; metered or consequential work must not
 * be replayed merely because the requested objective is still incomplete.
 */
export type CosGoalExecutionKind = 'read_only' | 'idempotent' | 'metered' | 'consequential'

export function mayAutomaticallyRetryGoal(kind: CosGoalExecutionKind): boolean {
  return kind === 'read_only' || kind === 'idempotent'
}

function clean(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].slice(0, 16)
}

export function completedGoal(
  evidence: readonly string[],
  options: Readonly<{ attempts?: number }> = {},
): CosGoalCompletion {
  return {
    status: 'done',
    evidence: clean(evidence),
    unresolved: [],
    recommended_next_action: 'deliver',
    ...(Number.isInteger(options.attempts) && Number(options.attempts) > 0 ? { attempts: Number(options.attempts) } : {}),
  }
}

export function partialGoal(
  evidence: readonly string[],
  unresolved: readonly string[],
  recommendedNextAction: Extract<CosGoalCompletionNextAction, 'retry' | 'delegate' | 'ask_user' | 'wait'>,
  options: Readonly<{ attempts?: number }> = {},
): CosGoalCompletion {
  return {
    status: 'partial',
    evidence: clean(evidence),
    unresolved: clean(unresolved),
    recommended_next_action: recommendedNextAction,
    ...(Number.isInteger(options.attempts) && Number(options.attempts) > 0 ? { attempts: Number(options.attempts) } : {}),
  }
}

export function blockedGoal(
  evidence: readonly string[],
  unresolved: readonly string[],
  recommendedNextAction: Extract<CosGoalCompletionNextAction, 'delegate' | 'ask_user' | 'wait'>,
  options: Readonly<{ attempts?: number }> = {},
): CosGoalCompletion {
  return {
    status: 'blocked',
    evidence: clean(evidence),
    unresolved: clean(unresolved),
    recommended_next_action: recommendedNextAction,
    ...(Number.isInteger(options.attempts) && Number(options.attempts) > 0 ? { attempts: Number(options.attempts) } : {}),
  }
}
