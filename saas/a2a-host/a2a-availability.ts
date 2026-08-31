import { validateA2AAgentCard } from '../a2a-core/a2a-client.ts'

export const A2A_AVAILABILITY_VERSION = 'signalboost-a2a-availability-v1' as const

export type A2AAvailabilityEvidence = Readonly<{
  available: boolean
  protocolVersion?: string
  agentName?: string
  skillId: string
  latencyMs: number
  error?: string
}>

function boundedLatency(startedAt: number): number {
  return Math.max(0, Math.min(120_000, Math.round(Date.now() - startedAt)))
}

/** Discovery/health only. This never grants authority or creates a delegation. */
export async function probeA2AAvailability(input: {
  fetchAgentCard: () => Promise<unknown>
  expectedSkillId: string
}): Promise<A2AAvailabilityEvidence> {
  const skillId = String(input.expectedSkillId || '').trim()
  if (!skillId) throw new Error('a2a_availability_skill_required')
  const startedAt = Date.now()
  try {
    const card = validateA2AAgentCard(await input.fetchAgentCard())
    if (!card.skills.some(skill => skill.id === skillId)) {
      return Object.freeze({ available: false, protocolVersion: card.protocolVersion, agentName: card.name, skillId, latencyMs: boundedLatency(startedAt), error: 'a2a_availability_skill_missing' })
    }
    return Object.freeze({ available: true, protocolVersion: card.protocolVersion, agentName: card.name, skillId, latencyMs: boundedLatency(startedAt) })
  } catch (error) {
    return Object.freeze({
      available: false,
      skillId,
      latencyMs: boundedLatency(startedAt),
      error: error instanceof Error ? error.message.slice(0, 160) : 'a2a_availability_failed',
    })
  }
}
