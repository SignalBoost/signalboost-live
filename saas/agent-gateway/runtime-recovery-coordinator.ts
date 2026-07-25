// saas/agent-gateway/runtime-recovery-coordinator.ts
//
// Host-neutral runtime recovery coordination. This module atomically claims recovery ownership,
// transfers journal authority to a higher fencing token, records evidence, and emits a scheduler
// instruction. It never starts infrastructure or executes governed/provider work.

import type { ContinuityLease } from './continuity.ts'
import type { AgentGatewayJournalEntry, JournalState } from './journal.ts'
import type { ReplicaHealthAssessment } from './replica-health.ts'
import type { TakeoverOrchestrationDecision } from './takeover-orchestrator.ts'
import { orchestrateTakeover } from './takeover-orchestrator.ts'

export type RecoverySchedulerAction =
  | 'none'
  | 'retain-owner'
  | 'recheck-after-expiry'
  | 'promote-for-safe-resume'
  | 'promote-for-verification'
  | 'quarantine'

export interface RuntimeRecoveryClaim {
  schemaVersion: 'agent-gateway-runtime-recovery-claim-v1'
  requestKey: string
  previousOwnerId: string
  recoveryOwnerId: string
  previousFencingToken: number
  recoveryFencingToken: number
  claimedAt: string
  readOnly: true
  executable: false
}

export interface RuntimeRecoveryEvidence {
  schemaVersion: 'agent-gateway-runtime-recovery-evidence-v1'
  requestKey: string
  recoveryOwnerId: string
  recoveryFencingToken: number
  disposition: TakeoverOrchestrationDecision['disposition']
  recordedAt: string
  reason: string
  readOnly: true
  executable: false
}

export interface RecoverySchedulerInstruction {
  schemaVersion: 'agent-gateway-recovery-scheduler-instruction-v1'
  requestKey: string
  candidateOwnerId: string
  fencingToken?: number
  action: RecoverySchedulerAction
  requiresExternalVerification: boolean
  requiresHumanReview: boolean
  readOnly: true
  executable: false
}

export interface RuntimeRecoveryResult {
  schemaVersion: 'agent-gateway-runtime-recovery-result-v1'
  decision: TakeoverOrchestrationDecision
  claim: RuntimeRecoveryClaim | null
  transferredJournal: AgentGatewayJournalEntry | null
  instruction: RecoverySchedulerInstruction
  evidence: RuntimeRecoveryEvidence
  readOnly: true
  executable: false
}

export interface RuntimeRecoveryStore {
  atomicClaim(input: {
    requestKey: string
    expectedOwnerId: string
    expectedFencingToken: number
    recoveryOwnerId: string
    claimedAt: string
  }): Promise<RuntimeRecoveryClaim | null>
  putJournal(entry: AgentGatewayJournalEntry): Promise<void>
  recordEvidence(evidence: RuntimeRecoveryEvidence): Promise<void>
}

function validDate(now: Date): string {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('invalid recovery clock')
  return now.toISOString()
}

function nextJournalState(decision: TakeoverOrchestrationDecision): JournalState {
  if (decision.disposition === 'promote-and-verify') return 'verification_pending'
  if (decision.disposition === 'protected-halt') return 'quarantined'
  return decision.reconciliation.nextState
}

function schedulerInstruction(
  decision: TakeoverOrchestrationDecision,
  fencingToken?: number,
): RecoverySchedulerInstruction {
  const action: RecoverySchedulerAction =
    decision.disposition === 'retain-current-owner' ? 'retain-owner'
      : decision.disposition === 'wait-for-fence-expiry' ? 'recheck-after-expiry'
        : decision.disposition === 'promote-and-resume' ? 'promote-for-safe-resume'
          : decision.disposition === 'promote-and-verify' ? 'promote-for-verification'
            : decision.disposition === 'protected-halt' ? 'quarantine'
              : 'none'

  return Object.freeze({
    schemaVersion: 'agent-gateway-recovery-scheduler-instruction-v1',
    requestKey: decision.requestKey,
    candidateOwnerId: decision.candidateOwnerId,
    ...(fencingToken ? { fencingToken } : {}),
    action,
    requiresExternalVerification: decision.requiresExternalVerification,
    requiresHumanReview: decision.requiresHumanReview,
    readOnly: true,
    executable: false,
  })
}

export class RuntimeRecoveryCoordinator {
  constructor(private readonly store: RuntimeRecoveryStore) {}

  async coordinate(input: {
    lease: ContinuityLease
    ownerHealth: ReplicaHealthAssessment
    candidateOwnerId: string
    journal: AgentGatewayJournalEntry
    now?: Date
  }): Promise<RuntimeRecoveryResult> {
    const now = input.now ?? new Date()
    const recordedAt = validDate(now)
    const decision = orchestrateTakeover(input)
    let claim: RuntimeRecoveryClaim | null = null
    let transferredJournal: AgentGatewayJournalEntry | null = null

    if (decision.nextFencingTokenRequired) {
      claim = await this.store.atomicClaim({
        requestKey: decision.requestKey,
        expectedOwnerId: decision.currentOwnerId,
        expectedFencingToken: decision.currentFencingToken,
        recoveryOwnerId: decision.candidateOwnerId,
        claimedAt: recordedAt,
      })
      if (!claim) throw new Error('runtime recovery claim rejected')
      if (claim.recoveryFencingToken <= decision.currentFencingToken) throw new Error('runtime recovery fencing did not advance')

      transferredJournal = Object.freeze({
        ...input.journal,
        ownerId: claim.recoveryOwnerId,
        fencingToken: claim.recoveryFencingToken,
        state: nextJournalState(decision),
        updatedAt: recordedAt,
        attempt: input.journal.attempt + 1,
        readOnly: true,
        executable: false,
      })
      await this.store.putJournal(transferredJournal)
    }

    const evidence: RuntimeRecoveryEvidence = Object.freeze({
      schemaVersion: 'agent-gateway-runtime-recovery-evidence-v1',
      requestKey: decision.requestKey,
      recoveryOwnerId: claim?.recoveryOwnerId ?? decision.currentOwnerId,
      recoveryFencingToken: claim?.recoveryFencingToken ?? decision.currentFencingToken,
      disposition: decision.disposition,
      recordedAt,
      reason: decision.reason,
      readOnly: true,
      executable: false,
    })
    await this.store.recordEvidence(evidence)

    return Object.freeze({
      schemaVersion: 'agent-gateway-runtime-recovery-result-v1',
      decision,
      claim,
      transferredJournal,
      instruction: schedulerInstruction(decision, claim?.recoveryFencingToken),
      evidence,
      readOnly: true,
      executable: false,
    })
  }
}

export class InMemoryRuntimeRecoveryStore implements RuntimeRecoveryStore {
  private readonly claims = new Map<string, RuntimeRecoveryClaim>()
  readonly journals = new Map<string, AgentGatewayJournalEntry>()
  readonly evidence: RuntimeRecoveryEvidence[] = []

  async atomicClaim(input: {
    requestKey: string
    expectedOwnerId: string
    expectedFencingToken: number
    recoveryOwnerId: string
    claimedAt: string
  }): Promise<RuntimeRecoveryClaim | null> {
    const existing = this.claims.get(input.requestKey)
    if (existing) return existing.recoveryOwnerId === input.recoveryOwnerId ? existing : null
    const claim = Object.freeze({
      schemaVersion: 'agent-gateway-runtime-recovery-claim-v1' as const,
      requestKey: input.requestKey,
      previousOwnerId: input.expectedOwnerId,
      recoveryOwnerId: input.recoveryOwnerId,
      previousFencingToken: input.expectedFencingToken,
      recoveryFencingToken: input.expectedFencingToken + 1,
      claimedAt: input.claimedAt,
      readOnly: true as const,
      executable: false as const,
    })
    this.claims.set(input.requestKey, claim)
    return claim
  }

  async putJournal(entry: AgentGatewayJournalEntry): Promise<void> {
    const current = this.journals.get(entry.identity.key)
    if (current && current.fencingToken > entry.fencingToken) throw new Error('runtime recovery stale journal rejected')
    this.journals.set(entry.identity.key, entry)
  }

  async recordEvidence(evidence: RuntimeRecoveryEvidence): Promise<void> {
    this.evidence.push(evidence)
  }
}
