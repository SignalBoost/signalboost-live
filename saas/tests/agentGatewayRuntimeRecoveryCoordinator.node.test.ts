import test from 'node:test'
import assert from 'node:assert/strict'
import {
  InMemoryRuntimeRecoveryStore,
  RuntimeRecoveryCoordinator,
  createContinuityRequestIdentity,
  type AgentGatewayJournalEntry,
  type ContinuityLease,
  type ReplicaHealthAssessment,
} from '../agent-gateway/index.ts'

const now = new Date('2026-07-25T20:00:00.000Z')
const identity = createContinuityRequestIdentity({
  tenantId: 'acme', environment: 'prod', protocol: 'mcp', requestId: 'req-1', actionKind: 'tool_call', target: 'restart-worker',
})

function lease(expiresAt = '2026-07-25T19:59:00.000Z'): ContinuityLease {
  return Object.freeze({ schemaVersion: 'agent-gateway-continuity-lease-v1', requestKey: identity.key, ownerId: 'gateway-a', fencingToken: 4, acquiredAt: '2026-07-25T19:58:00.000Z', expiresAt, readOnly: true, executable: false })
}

function health(state: ReplicaHealthAssessment['state'] = 'abandoned'): ReplicaHealthAssessment {
  return Object.freeze({ schemaVersion: 'agent-gateway-replica-health-v1', replicaId: 'gateway-a', state, heartbeatAgeMs: 60_000, reason: 'test', readOnly: true, executable: false })
}

function journal(consequenceClass: AgentGatewayJournalEntry['safety']['consequenceClass'] = 'reversible_internal', state: AgentGatewayJournalEntry['state'] = 'authorized'): AgentGatewayJournalEntry {
  return Object.freeze({ schemaVersion: 'agent-gateway-journal-v1', identity, state, safety: { consequenceClass, idempotent: consequenceClass === 'reversible_internal', externallyMutating: consequenceClass === 'external_effect', irreversible: consequenceClass === 'financial' }, ownerId: 'gateway-a', fencingToken: 4, acceptedAt: '2026-07-25T19:58:00.000Z', updatedAt: '2026-07-25T19:58:30.000Z', attempt: 1, readOnly: true, executable: false })
}

test('atomically transfers safe recovery ownership and emits scheduler instruction', async () => {
  const store = new InMemoryRuntimeRecoveryStore()
  const result = await new RuntimeRecoveryCoordinator(store).coordinate({ lease: lease(), ownerHealth: health(), candidateOwnerId: 'gateway-b', journal: journal(), now })
  assert.equal(result.decision.disposition, 'promote-and-resume')
  assert.equal(result.claim?.recoveryFencingToken, 5)
  assert.equal(result.transferredJournal?.ownerId, 'gateway-b')
  assert.equal(result.transferredJournal?.attempt, 2)
  assert.equal(result.instruction.action, 'promote-for-safe-resume')
  assert.equal(store.evidence.length, 1)
})

test('duplicate recovery by same candidate is idempotent', async () => {
  const store = new InMemoryRuntimeRecoveryStore()
  const coordinator = new RuntimeRecoveryCoordinator(store)
  const input = { lease: lease(), ownerHealth: health(), candidateOwnerId: 'gateway-b', journal: journal(), now }
  const first = await coordinator.coordinate(input)
  const second = await coordinator.coordinate(input)
  assert.equal(first.claim?.recoveryFencingToken, second.claim?.recoveryFencingToken)
})

test('competing recovery owner is rejected', async () => {
  const store = new InMemoryRuntimeRecoveryStore()
  const coordinator = new RuntimeRecoveryCoordinator(store)
  await coordinator.coordinate({ lease: lease(), ownerHealth: health(), candidateOwnerId: 'gateway-b', journal: journal(), now })
  await assert.rejects(() => coordinator.coordinate({ lease: lease(), ownerHealth: health(), candidateOwnerId: 'gateway-c', journal: journal(), now }), /claim rejected/)
})

test('financial uncertainty is quarantined without ownership transfer', async () => {
  const store = new InMemoryRuntimeRecoveryStore()
  const result = await new RuntimeRecoveryCoordinator(store).coordinate({ lease: lease(), ownerHealth: health(), candidateOwnerId: 'gateway-b', journal: journal('financial', 'executing'), now })
  assert.equal(result.decision.disposition, 'protected-halt')
  assert.equal(result.claim, null)
  assert.equal(result.instruction.action, 'quarantine')
  assert.equal(result.instruction.requiresHumanReview, true)
})

test('healthy owner is retained and no claim is created', async () => {
  const store = new InMemoryRuntimeRecoveryStore()
  const result = await new RuntimeRecoveryCoordinator(store).coordinate({ lease: lease('2026-07-25T20:01:00.000Z'), ownerHealth: health('healthy'), candidateOwnerId: 'gateway-b', journal: journal(), now })
  assert.equal(result.decision.disposition, 'retain-current-owner')
  assert.equal(result.claim, null)
  assert.equal(result.instruction.action, 'retain-owner')
})
