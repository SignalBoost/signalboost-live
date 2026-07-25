// saas/agent-gateway/journal.ts
//
// Durable, host-neutral request journal and restart reconciliation primitives.
// This module classifies interrupted work for safe autonomous recovery. It never
// executes provider actions and never automatically replays uncertain consequential mutations.

import type { ContinuityLease, ContinuityRequestIdentity } from './continuity.ts'

export type JournalState =
  | 'accepted'
  | 'authorized'
  | 'executing'
  | 'verification_pending'
  | 'completed'
  | 'failed'
  | 'quarantined'

export type RecoveryClass =
  | 'resume_safe'
  | 'verify_before_resume'
  | 'quarantine_for_human'
  | 'terminal'

export interface JournalSafetyProfile {
  consequenceClass:
    | 'read_only'
    | 'reversible_internal'
    | 'external_effect'
    | 'financial'
    | 'data_destructive'
    | 'security'
    | 'safety'
    | 'unknown'
  idempotent: boolean
  externallyMutating: boolean
  irreversible: boolean
}

export interface AgentGatewayJournalEntry {
  schemaVersion: 'agent-gateway-journal-v1'
  identity: ContinuityRequestIdentity
  state: JournalState
  safety: JournalSafetyProfile
  ownerId: string
  fencingToken: number
  acceptedAt: string
  updatedAt: string
  attempt: number
  lastEvidenceRef?: string
  readOnly: true
  executable: false
}

export interface JournalStore {
  get(requestKey: string): Promise<AgentGatewayJournalEntry | null>
  put(entry: AgentGatewayJournalEntry): Promise<void>
  listRecoverable(): Promise<readonly AgentGatewayJournalEntry[]>
}

export interface ReconciliationDecision {
  schemaVersion: 'agent-gateway-reconciliation-decision-v1'
  requestKey: string
  recoveryClass: RecoveryClass
  reason: string
  nextState: JournalState
  requiresExternalVerification: boolean
  requiresHumanReview: boolean
  readOnly: true
  executable: false
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/
const EVIDENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#-]{0,399}$/

function required(value: string, field: string): string {
  const normalized = value.trim()
  if (!ID.test(normalized)) throw new Error(`invalid journal ${field}`)
  return normalized
}

function timestamp(value: string, field: string): string {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) throw new Error(`invalid journal ${field}`)
  return new Date(time).toISOString()
}

function validateSafety(safety: JournalSafetyProfile): JournalSafetyProfile {
  if (!safety || typeof safety !== 'object') throw new Error('invalid journal safety profile')
  return Object.freeze({ ...safety })
}

export function createJournalEntry(input: {
  identity: ContinuityRequestIdentity
  lease: ContinuityLease
  safety: JournalSafetyProfile
  now: string
}): AgentGatewayJournalEntry {
  if (input.identity.key !== input.lease.requestKey) throw new Error('journal identity lease mismatch')
  const now = timestamp(input.now, 'now')
  return Object.freeze({
    schemaVersion: 'agent-gateway-journal-v1',
    identity: input.identity,
    state: 'accepted',
    safety: validateSafety(input.safety),
    ownerId: required(input.lease.ownerId, 'ownerId'),
    fencingToken: input.lease.fencingToken,
    acceptedAt: now,
    updatedAt: now,
    attempt: 1,
    readOnly: true,
    executable: false,
  })
}

export function advanceJournalEntry(
  current: AgentGatewayJournalEntry,
  lease: ContinuityLease,
  nextState: JournalState,
  now: string,
  evidenceRef?: string,
): AgentGatewayJournalEntry {
  if (current.identity.key !== lease.requestKey) throw new Error('journal request mismatch')
  if (current.ownerId !== lease.ownerId || current.fencingToken !== lease.fencingToken) {
    throw new Error('journal stale owner rejected')
  }
  const updatedAt = timestamp(now, 'updatedAt')
  if (Date.parse(updatedAt) < Date.parse(current.updatedAt)) throw new Error('journal time regression')
  if (evidenceRef && !EVIDENCE.test(evidenceRef)) throw new Error('invalid journal evidenceRef')

  return Object.freeze({
    ...current,
    state: nextState,
    updatedAt,
    ...(evidenceRef ? { lastEvidenceRef: evidenceRef } : {}),
    readOnly: true,
    executable: false,
  })
}

export function reconcileJournalEntry(entry: AgentGatewayJournalEntry): ReconciliationDecision {
  const terminal = entry.state === 'completed' || entry.state === 'failed' || entry.state === 'quarantined'
  if (terminal) {
    return Object.freeze({
      schemaVersion: 'agent-gateway-reconciliation-decision-v1',
      requestKey: entry.identity.key,
      recoveryClass: 'terminal',
      reason: `journal state ${entry.state} is terminal`,
      nextState: entry.state,
      requiresExternalVerification: false,
      requiresHumanReview: entry.state === 'quarantined',
      readOnly: true,
      executable: false,
    })
  }

  const consequential = ['financial', 'data_destructive', 'security', 'safety', 'unknown'].includes(entry.safety.consequenceClass)
  if (consequential && (entry.state === 'executing' || entry.state === 'verification_pending')) {
    return Object.freeze({
      schemaVersion: 'agent-gateway-reconciliation-decision-v1',
      requestKey: entry.identity.key,
      recoveryClass: 'quarantine_for_human',
      reason: 'uncertain consequential execution cannot be replayed automatically',
      nextState: 'quarantined',
      requiresExternalVerification: true,
      requiresHumanReview: true,
      readOnly: true,
      executable: false,
    })
  }

  if (entry.safety.externallyMutating && (entry.state === 'executing' || entry.state === 'verification_pending')) {
    return Object.freeze({
      schemaVersion: 'agent-gateway-reconciliation-decision-v1',
      requestKey: entry.identity.key,
      recoveryClass: 'verify_before_resume',
      reason: 'external mutation outcome must be verified before retry',
      nextState: 'verification_pending',
      requiresExternalVerification: true,
      requiresHumanReview: false,
      readOnly: true,
      executable: false,
    })
  }

  if (entry.safety.idempotent || entry.safety.consequenceClass === 'read_only') {
    return Object.freeze({
      schemaVersion: 'agent-gateway-reconciliation-decision-v1',
      requestKey: entry.identity.key,
      recoveryClass: 'resume_safe',
      reason: 'request is read-only or explicitly idempotent',
      nextState: entry.state === 'accepted' ? 'accepted' : 'authorized',
      requiresExternalVerification: false,
      requiresHumanReview: false,
      readOnly: true,
      executable: false,
    })
  }

  return Object.freeze({
    schemaVersion: 'agent-gateway-reconciliation-decision-v1',
    requestKey: entry.identity.key,
    recoveryClass: 'verify_before_resume',
    reason: 'non-idempotent interrupted request requires outcome verification',
    nextState: 'verification_pending',
    requiresExternalVerification: true,
    requiresHumanReview: false,
    readOnly: true,
    executable: false,
  })
}

export class AgentGatewayRestartReconciler {
  constructor(private readonly store: JournalStore) {}

  async inspect(): Promise<readonly ReconciliationDecision[]> {
    const entries = await this.store.listRecoverable()
    return Object.freeze(
      [...entries]
        .sort((a, b) => a.identity.key.localeCompare(b.identity.key))
        .map(reconcileJournalEntry),
    )
  }
}

export class InMemoryJournalStore implements JournalStore {
  private readonly entries = new Map<string, AgentGatewayJournalEntry>()

  async get(requestKey: string): Promise<AgentGatewayJournalEntry | null> {
    return this.entries.get(requestKey) ?? null
  }

  async put(entry: AgentGatewayJournalEntry): Promise<void> {
    const current = this.entries.get(entry.identity.key)
    if (current && entry.fencingToken < current.fencingToken) throw new Error('journal stale fencing token rejected')
    this.entries.set(entry.identity.key, entry)
  }

  async listRecoverable(): Promise<readonly AgentGatewayJournalEntry[]> {
    return Object.freeze(
      [...this.entries.values()].filter((entry) => !['completed', 'failed', 'quarantined'].includes(entry.state)),
    )
  }
}
