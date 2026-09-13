// Shared agent-scope primitives for COS University PhD/research execution.
// PhD evidence remains host-controlled; this module only binds work to one learner identity.

export const DEFAULT_PHD_AGENT_ID = 'cos' as const

export function requirePhdAgentId(agentId: string): string {
  if (typeof agentId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,179}$/.test(agentId)) {
    throw new Error('invalid_phd_agent_id')
  }
  return agentId
}

/**
 * Stable hourly rotation prevents one learner from monopolizing PhD cron capacity. The rotation
 * changes scheduling order only; it grants no admission, academic credit, credential, or authority.
 */
export function rotatePhdAgents<T extends { agentId: string }>(agents: readonly T[], now: Date, salt = 0): T[] {
  const hour = Math.floor(now.getTime() / 3_600_000)
  if (!Number.isFinite(hour)) throw new Error('invalid_phd_schedule_time')
  if (!agents.length) return []
  for (const agent of agents) requirePhdAgentId(agent.agentId)
  const offset = (((hour + Math.trunc(salt)) % agents.length) + agents.length) % agents.length
  return [...agents.slice(offset), ...agents.slice(0, offset)]
}
