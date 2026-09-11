import { createHash } from 'node:crypto'

/** Host identity only. A caller cannot turn a missing or malformed identity into COS. */
export function requireMastersLearningAgentId(agentId: string): string {
  if (typeof agentId !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,179}$/.test(agentId)) {
    throw new Error('invalid_masters_learning_agent_id')
  }
  return agentId
}

/** Preserve COS's historical identities; other learners have disjoint durable namespaces. */
export function mastersLearningSlotKey(agentId: string, programId: string, slot: string): string {
  requireMastersLearningAgentId(agentId)
  return agentId === 'cos' ? `${programId}:${slot}` : `agent:${agentId}:${programId}:${slot}`
}

export function mastersLearningPlanKey(agentId: string, programId: string, moduleKey: string): string {
  requireMastersLearningAgentId(agentId)
  const input = agentId === 'cos'
    ? `masters|${programId}|${moduleKey}`
    : JSON.stringify(['masters', agentId, programId, moduleKey])
  return createHash('sha256').update(input).digest('hex')
}

/** An existing enrollment alone cannot waive the common undergraduate foundation. */
export function mastersLearningProgramBlocker(state: {
  agentId: string
  admission: { admitted: boolean }
  enrollment: unknown
  credential: unknown
  timingStatus: string
}, agentId: string): string | null {
  requireMastersLearningAgentId(agentId)
  if (state.agentId !== agentId) throw new Error('masters_learning_scope_mismatch')
  if (state.admission.admitted !== true) return 'undergraduate_foundation_not_ready'
  if (!state.enrollment || state.credential) return 'masters_program_inactive'
  if (!['minimum_residence', 'on_schedule', 'target_date_passed'].includes(state.timingStatus)) {
    return 'masters_program_inactive'
  }
  return null
}

/** Absolute half-hour slots avoid midnight starvation, even with more than 48 learners. */
export function rotateMastersLearningAgents<T>(agents: readonly T[], now: Date): T[] {
  const slot = Math.floor(now.getTime() / 1_800_000)
  if (!Number.isFinite(slot)) throw new Error('invalid_masters_learning_time')
  if (!agents.length) return []
  const offset = ((slot % agents.length) + agents.length) % agents.length
  return [...agents.slice(offset), ...agents.slice(0, offset)]
}

type BatchResult = { agentId: string; claimed: boolean; status: string }

/** At most one claimed learning batch. Ineligible or already-claimed agents do not consume it. */
export async function runOneMastersLearningAgent<T extends BatchResult>(
  agents: readonly { agentId: string }[], now: Date, run: (agentId: string) => Promise<T>,
): Promise<{ result: T | null; checked: T[] }> {
  const checked: T[] = []
  for (const agent of rotateMastersLearningAgents(agents, now)) {
    requireMastersLearningAgentId(agent.agentId)
    const result = await run(agent.agentId)
    if (result.agentId !== agent.agentId) throw new Error('masters_learning_scope_mismatch')
    checked.push(result)
    if (result.claimed || result.status === 'error' || result.status === 'disabled') return { result, checked }
  }
  return { result: null, checked }
}
