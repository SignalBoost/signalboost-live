import type { A2ADelegationRisk } from './a2a-agent-registry.ts'

export const A2A_RUNTIME_OBSERVATION_VERSION = 'signalboost-a2a-runtime-observation-v1' as const

export interface A2ARuntimeObservationEvent {
  schemaVersion: typeof A2A_RUNTIME_OBSERVATION_VERSION
  eventId: string
  occurredAt: string
  durationMs: number
  tenantId: string
  environmentId: string
  portableId: string
  agentId: string
  skillId: string
  assignmentId?: string
  transportRef?: string
  risk?: A2ADelegationRisk
  approvalId?: string
  traceId?: string
  ok: boolean
  mode: string
  errorCode?: string
}

export interface A2ARuntimeObservationPort {
  append(event: A2ARuntimeObservationEvent): Promise<void>
}

/**
 * Observation events are metadata-only by contract. Do not add prompt text,
 * response payloads, endpoint URLs, headers, credentials, tokens, or secrets.
 */
export function createInMemoryA2ARuntimeObserver() {
  const events: A2ARuntimeObservationEvent[] = []
  return Object.freeze({
    async append(event: A2ARuntimeObservationEvent) {
      events.push(Object.freeze({ ...event }))
    },
    snapshot(): readonly A2ARuntimeObservationEvent[] {
      return Object.freeze(events.map(event => Object.freeze({ ...event })))
    },
  })
}
