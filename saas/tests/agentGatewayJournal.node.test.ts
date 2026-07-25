import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AgentGatewayRestartReconciler,
  InMemoryJournalStore,
  createContinuityRequestIdentity,
  createJournalEntry,
  reconcileJournalEntry,
  type ContinuityLease,
  type JournalSafetyProfile,
} from '../agent-gateway/index.ts'

const identity = createContinuityRequestIdentity({
  tenantId: 'acme',
  environment: 'prod',
  protocol: 'mcp',
  requestId: 'req-1',
  actionKind: 'tool_call',
  target: 'restart-worker',
})

const lease: ContinuityLease = Object.freeze({
  schemaVersion: 'agent-gateway-continuity-lease-v1',
  requestKey: identity.key,
  ownerId: 'gateway-a',
  fencingToken: 1,
  acquiredAt: '2026-07-25T20:00:00.000Z',
  expiresAt: '2026-07-25T20:00:30.000Z',
  readOnly: true,
  executable: false,
})

const safe: JournalSafetyProfile = {
  consequenceClass: 'reversible_internal',
  idempotent: true,
  externallyMutating: false,
  irreversible: false,
}

test('creates immutable non-executable accepted journal entry', () => {
  const entry = createJournalEntry({ identity, lease, safety: safe, now: '2026-07-25T20:00:01Z' })
  assert.equal(entry.state, 'accepted')
  assert.equal(entry.attempt, 1)
  assert.equal(entry.readOnly, true)
  assert.equal(entry.executable, false)
  assert.ok(Object.isFrozen(entry))
  assert.ok(Object.isFrozen(entry.safety))
})

test('read-only and idempotent interrupted work is safe to resume', () => {
  const entry = createJournalEntry({ identity, lease, safety: safe, now: '2026-07-25T20:00:01Z' })
  const decision = reconcileJournalEntry({ ...entry, state: 'authorized' })
  assert.equal(decision.recoveryClass, 'resume_safe')
  assert.equal(decision.requiresHumanReview, false)
  assert.equal(decision.requiresExternalVerification, false)
})

test('uncertain financial execution is quarantined for human review', () => {
  const entry = createJournalEntry({
    identity,
    lease,
    safety: {
      consequenceClass: 'financial',
      idempotent: false,
      externallyMutating: true,
      irreversible: false,
    },
    now: '2026-07-25T20:00:01Z',
  })
  const decision = reconcileJournalEntry({ ...entry, state: 'executing' })
  assert.equal(decision.recoveryClass, 'quarantine_for_human')
  assert.equal(decision.nextState, 'quarantined')
  assert.equal(decision.requiresHumanReview, true)
  assert.equal(decision.requiresExternalVerification, true)
})

test('uncertain non-consequential external mutation requires verification before retry', () => {
  const entry = createJournalEntry({
    identity,
    lease,
    safety: {
      consequenceClass: 'external_effect',
      idempotent: false,
      externallyMutating: true,
      irreversible: false,
    },
    now: '2026-07-25T20:00:01Z',
  })
  const decision = reconcileJournalEntry({ ...entry, state: 'verification_pending' })
  assert.equal(decision.recoveryClass, 'verify_before_resume')
  assert.equal(decision.requiresHumanReview, false)
  assert.equal(decision.requiresExternalVerification, true)
})

test('restart reconciliation is deterministic and excludes terminal records', async () => {
  const store = new InMemoryJournalStore()
  const active = createJournalEntry({ identity, lease, safety: safe, now: '2026-07-25T20:00:01Z' })
  await store.put(active)

  const terminalIdentity = createContinuityRequestIdentity({
    tenantId: 'acme',
    environment: 'prod',
    protocol: 'a2a',
    requestId: 'req-2',
    actionKind: 'task',
    target: 'inspect-status',
  })
  await store.put({ ...active, identity: terminalIdentity, state: 'completed' })

  const decisions = await new AgentGatewayRestartReconciler(store).inspect()
  assert.equal(decisions.length, 1)
  assert.equal(decisions[0]?.requestKey, identity.key)
  assert.equal(decisions[0]?.recoveryClass, 'resume_safe')
})

test('journal store rejects stale fencing tokens', async () => {
  const store = new InMemoryJournalStore()
  const entry = createJournalEntry({ identity, lease, safety: safe, now: '2026-07-25T20:00:01Z' })
  await store.put({ ...entry, fencingToken: 2 })
  await assert.rejects(() => store.put(entry), /stale fencing token/)
})

test('identity and lease mismatch fails closed', () => {
  const other = createContinuityRequestIdentity({
    tenantId: 'other',
    environment: 'prod',
    protocol: 'mcp',
    requestId: 'req-1',
    actionKind: 'tool_call',
    target: 'restart-worker',
  })
  assert.throws(
    () => createJournalEntry({ identity: other, lease, safety: safe, now: '2026-07-25T20:00:01Z' }),
    /identity lease mismatch/,
  )
})
