import type { SecurityEvidenceChainEntry } from './evidence.ts'
import type { SignedSecurityEngagement, TrustedSecurityEngagementKeys } from './engagement.ts'
import type { SecurityHostState } from './referee.ts'
import { ingestRepositoryPatrolEvent, type RepositoryPatrolEvent } from './repository-patrol.ts'

export interface DurableRepositoryPatrolStore {
  loadEvidenceChain(engagementId: string): Promise<readonly SecurityEvidenceChainEntry[]>
  appendEvidence(params: {
    entry: SecurityEvidenceChainEntry
    deliveryId: string
    repository: string
    eventType: string
  }): Promise<'inserted' | 'duplicate' | 'conflict'>
}

export type DurableRepositoryPatrolResult = Readonly<{
  accepted: boolean
  reason: string
  persisted: boolean
  duplicate: boolean
  entry?: SecurityEvidenceChainEntry
}>

function engagementId(envelope: unknown): string {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) return ''
  const manifest = (envelope as Record<string, unknown>).manifest
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return ''
  const value = (manifest as Record<string, unknown>).engagementId
  return typeof value === 'string' ? value : ''
}

export async function ingestDurableRepositoryPatrolEvent(params: {
  envelope: SignedSecurityEngagement | unknown
  trustedKeys: TrustedSecurityEngagementKeys
  hostState: SecurityHostState
  event: RepositoryPatrolEvent | unknown
  store: DurableRepositoryPatrolStore
}): Promise<DurableRepositoryPatrolResult> {
  const id = engagementId(params.envelope)
  if (!id) return Object.freeze({ accepted: false, reason: 'invalid_envelope', persisted: false, duplicate: false })

  let chain: readonly SecurityEvidenceChainEntry[]
  try {
    chain = await params.store.loadEvidenceChain(id)
  } catch {
    return Object.freeze({ accepted: false, reason: 'evidence_store_unavailable', persisted: false, duplicate: false })
  }

  const result = ingestRepositoryPatrolEvent({
    envelope: params.envelope,
    trustedKeys: params.trustedKeys,
    hostState: params.hostState,
    event: params.event,
    evidenceChain: chain,
  })
  if (!result.accepted) {
    return Object.freeze({ accepted: false, reason: result.reason, persisted: false, duplicate: false })
  }

  const current = result.evidenceChain[result.evidenceChain.length - 1]
  const patrolEvent = params.event as RepositoryPatrolEvent
  const deliveryId = patrolEvent.sourceProvenance?.deliveryId ?? patrolEvent.eventId
  let appended: 'inserted' | 'duplicate' | 'conflict'
  try {
    appended = await params.store.appendEvidence({
      entry: current,
      deliveryId,
      repository: patrolEvent.repository,
      eventType: patrolEvent.eventType,
    })
  } catch {
    return Object.freeze({ accepted: false, reason: 'evidence_store_unavailable', persisted: false, duplicate: false })
  }

  if (appended === 'duplicate') {
    return Object.freeze({ accepted: true, reason: 'duplicate', persisted: true, duplicate: true })
  }
  if (appended === 'conflict') {
    return Object.freeze({ accepted: false, reason: 'evidence_chain_conflict', persisted: false, duplicate: false })
  }
  return Object.freeze({ accepted: true, reason: 'persisted', persisted: true, duplicate: false, entry: current })
}
