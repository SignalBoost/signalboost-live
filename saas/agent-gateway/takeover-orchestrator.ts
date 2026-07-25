// saas/agent-gateway/takeover-orchestrator.ts
//
// Deterministic, host-neutral takeover orchestration. This module combines replica health,
// continuity leases, fencing, and journal reconciliation into one non-executing recovery plan.

import type { ContinuityLease } from './continuity.ts'
import type { AgentGatewayJournalEntry, ReconciliationDecision } from './journal.ts'
import { reconcileJournalEntry } from './journal.ts'
import type { ReplicaHealthAssessment, TakeoverPlan } from './replica-health.ts'
import { planReplicaTakeover } from './replica-health.ts'

export type OrchestratedRecoveryDisposition =
  | 'retain-current-owner'
  | 'wait-for-fence-expiry'
  | 'promote-and-resume'
  | 'promote-and-verify'
  | 'protected-halt'
  | 'terminal-noop'

export interface TakeoverOrchestrationInput {
  lease: ContinuityLease
  ownerHealth: ReplicaHealthAssessment
  candidateOwnerId: string
  journal: AgentGatewayJournalEntry
  now?: Date
}

export interface TakeoverOrchestrationDecision {
  schemaVersion: 'agent-gateway-takeover-orchestration-v1'
  requestKey: string
  currentOwnerId: string
  candidateOwnerId: string
  currentFencingToken: number
  nextFencingTokenRequired: boolean
  disposition: OrchestratedRecoveryDisposition
  takeover: TakeoverPlan
  reconciliation: ReconciliationDecision
  reason: string
  requiresExternalVerification: boolean
  requiresHumanReview: boolean
  readOnly: true
  executable: false
}

function assertBoundaries(input: TakeoverOrchestrationInput): void {
  if (input.lease.requestKey !== input.journal.identity.key) throw new Error('orchestration request mismatch')
  if (input.lease.ownerId !== input.journal.ownerId) throw new Error('orchestration owner mismatch')
  if (input.lease.fencingToken !== input.journal.fencingToken) throw new Error('orchestration fencing mismatch')
  if (input.ownerHealth.replicaId !== input.lease.ownerId) throw new Error('orchestration health owner mismatch')
}

export function orchestrateTakeover(input: TakeoverOrchestrationInput): TakeoverOrchestrationDecision {
  assertBoundaries(input)
  const reconciliation = reconcileJournalEntry(input.journal)
  const protectedAction = reconciliation.recoveryClass === 'quarantine_for_human'
  const takeover = planReplicaTakeover(
    input.lease,
    input.ownerHealth,
    input.candidateOwnerId,
    input.now ?? new Date(),
    protectedAction,
  )

  let disposition: OrchestratedRecoveryDisposition
  let reason: string
  let nextFencingTokenRequired = false

  if (reconciliation.recoveryClass === 'terminal') {
    disposition = 'terminal-noop'
    reason = 'journal entry is terminal; no takeover or replay is permitted'
  } else if (takeover.disposition === 'protected-halt') {
    disposition = 'protected-halt'
    reason = reconciliation.reason
  } else if (takeover.disposition === 'retain-owner') {
    disposition = 'retain-current-owner'
    reason = takeover.reason
  } else if (takeover.disposition === 'wait-for-expiry') {
    disposition = 'wait-for-fence-expiry'
    reason = takeover.reason
  } else if (reconciliation.recoveryClass === 'resume_safe') {
    disposition = 'promote-and-resume'
    reason = 'owner abandoned, lease expired, and journal permits safe autonomous resume'
    nextFencingTokenRequired = true
  } else if (reconciliation.recoveryClass === 'verify_before_resume') {
    disposition = 'promote-and-verify'
    reason = 'owner abandoned and lease expired; replacement must verify outcome before resume'
    nextFencingTokenRequired = true
  } else {
    disposition = 'protected-halt'
    reason = 'recovery state is not safe for autonomous continuation'
  }

  return Object.freeze({
    schemaVersion: 'agent-gateway-takeover-orchestration-v1',
    requestKey: input.lease.requestKey,
    currentOwnerId: input.lease.ownerId,
    candidateOwnerId: input.candidateOwnerId,
    currentFencingToken: input.lease.fencingToken,
    nextFencingTokenRequired,
    disposition,
    takeover,
    reconciliation,
    reason,
    requiresExternalVerification: reconciliation.requiresExternalVerification,
    requiresHumanReview: reconciliation.requiresHumanReview,
    readOnly: true,
    executable: false,
  })
}
