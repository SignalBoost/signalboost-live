/**
 * Durable external requests must never be certified by the assistant's prose.
 * A transport success or explanatory reply is not an execution receipt.
 * Pending jobs are not completed outcomes.
 */
export function verifyExecutionOutcome(input: {
  httpOk: boolean
  payload: Record<string, unknown> | null
}): 'succeeded' | 'failed' | 'pending' {
  const { httpOk, payload } = input
  if (!httpOk || !payload || payload.ok === false || payload.error) return 'failed'
  const status = payload.status
  if (status === 'queued' || status === 'running' || status === 'pending') return 'pending'
  if (status === 'failed' || status === 'cancelled') return 'failed'
  // These facts must be supplied by the execution subsystem, not inferred from text.
  if (payload.external_action_taken === true || (status === 'succeeded' && payload.execution_allowed !== false)) {
    return 'succeeded'
  }
  return 'failed'
}
