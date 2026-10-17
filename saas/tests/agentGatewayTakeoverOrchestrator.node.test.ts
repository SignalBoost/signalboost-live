import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createContinuityRequestIdentity,
  createJournalEntry,
  createReplicaHeartbeat,
  assessReplicaHealth,
  orchestrateTakeover,
  type ContinuityLease,
  type JournalSafetyProfile,
} from '../agent-gateway/index.ts'

const now = new Date('2026-07-25T20:00:00.000Z')

function fixture(safety: JournalSafetyProfile, state: 'accepted' | 'executing' | 'completed' = 'accepted') {
  const identity = createContinuityRequestIdentity({
    tenantId: 'acme', environment: 'prod', protocol: 'mcp', requestId: 'req-1', actionKind: 'tool_call', target: 'restart-worker',
  })
  const lease: ContinuityLease = Object.freeze({
    schemaVersion: 'agent-gateway-continuity-lease-v1', requestKey: identity.key, ownerId: 'gw-a', fencingToken: 7,
    acquiredAt: '2026-07-25T19:58:00.000Z', expiresAt: '2026-07-25T19:59:00.000Z', readOnly: true, executable: false,
  })
  const base = createJournalEntry({ identity, lease, safety, now: '2026-07-25T19:58:00.000Z' })
  const journal = Object.freeze({ ...base, state, updatedAt: '2026-07-25T19:58:30.000Z' })
  const heartbeat = createReplicaHeartbeat({ replicaId: 'gw-a', role: 'gateway', region: 'us-east', version: '1.0.0', queueDepth: 2, activeLeaseCount: 1, restartCount: 0, healthScore: 80 }, new Date('2026-07-25T19:58:30.000Z'))
  const ownerHealth = assessReplicaHealth(heartbeat, 'gw-a', now, 15_000, 45_000)
  return { lease, journal, ownerHealth }
}

const safe: JournalSafetyProfile = { consequenceClass: 'reversible_internal', idempotent: true, externallyMutating: false, irreversible: false }
const external: JournalSafetyProfile = { consequenceClass: 'external_effect', idempotent: false, externallyMutating: true, irreversible: false }
const financial: JournalSafetyProfile = { consequenceClass: 'financial', idempotent: false, externallyMutating: true, irreversible: false }

test('abandoned owner with expired lease promotes and safely resumes idempotent work', () => {
  const f = fixture(safe, 'accepted')
  const decision = orchestrateTakeover({ ...f, candidateOwnerId: 'gw-b', now })
  assert.equal(decision.disposition, 'promote-and-resume')
  assert.equal(decision.nextFencingTokenRequired, true)
  assert.equal(decision.requiresHumanReview, false)
})

test('uncertain external mutation promotes only for verification', () => {
  const f = fixture(external, 'executing')
  const decision = orchestrateTakeover({ ...f, candidateOwnerId: 'gw-b', now })
  assert.equal(decision.disposition, 'promote-and-verify')
  assert.equal(decision.requiresExternalVerification, true)
})

test('uncertain financial execution remains protected halt', () => {
  const f = fixture(financial, 'executing')
  const decision = orchestrateTakeover({ ...f, candidateOwnerId: 'gw-b', now })
  assert.equal(decision.disposition, 'protected-halt')
  assert.equal(decision.requiresHumanReview, true)
  assert.equal(decision.nextFencingTokenRequired, false)
})

test('healthy current owner is retained', () => {
  const f = fixture(safe, 'accepted')
  const heartbeat = createReplicaHeartbeat({ replicaId: 'gw-a', role: 'gateway', region: 'us-east', version: '1.0.0', queueDepth: 0, activeLeaseCount: 1, restartCount: 0, healthScore: 95 }, now)
  const ownerHealth = assessReplicaHealth(heartbeat, 'gw-a', now)
  const liveLease = Object.freeze({ ...f.lease, expiresAt: '2026-07-25T20:01:00.000Z' })
  const journal = Object.freeze({ ...f.journal, fencingToken: liveLease.fencingToken })
  const decision = orchestrateTakeover({ lease: liveLease, journal, ownerHealth, candidateOwnerId: 'gw-b', now })
  assert.equal(decision.disposition, 'retain-current-owner')
})

test('terminal journal records are never replayed', () => {
  const f = fixture(safe, 'completed')
  const decision = orchestrateTakeover({ ...f, candidateOwnerId: 'gw-b', now })
  assert.equal(decision.disposition, 'terminal-noop')
})

test('mismatched request and fencing boundaries fail closed', () => {
  const f = fixture(safe, 'accepted')
  assert.throws(() => orchestrateTakeover({ ...f, lease: { ...f.lease, fencingToken: 8 }, candidateOwnerId: 'gw-b', now }), /fencing mismatch/)
})


test('COS recovery state-space: terminal work never replays; plans never execute automatically', () => {
  const profiles = [safe, external, financial]
  const states = ['accepted', 'executing', 'completed'] as const
  const leases = ['expired', 'active'] as const
  const healthStates = ['abandoned', 'healthy'] as const
  let cases = 0
  for (const profile of profiles) for (const state of states) for (const leaseState of leases) for (const healthState of healthStates) {
    const f = fixture(profile, state)
    const heartbeat = createReplicaHeartbeat({
      replicaId: 'gw-a', role: 'gateway', region: 'us-east', version: '1.0.0',
      queueDepth: 0, activeLeaseCount: 1, restartCount: 0, healthScore: 95,
    }, healthState === 'healthy' ? now : new Date('2026-07-25T19:58:30.000Z'))
    const ownerHealth = assessReplicaHealth(heartbeat, 'gw-a', now, 15_000, 45_000)
    const lease = { ...f.lease, expiresAt: leaseState === 'expired'
      ? '2026-07-25T19:59:00.000Z' : '2026-07-25T20:01:00.000Z' }
    const decision = orchestrateTakeover({ ...f, ownerHealth, lease, candidateOwnerId: 'gw-b', now })
    const description = JSON.stringify({profile:profile.consequenceClass,state,leaseState,healthState})
    assert.equal(decision.readOnly, true, description)
    assert.equal(decision.executable, false, description)
    assert.equal(decision.requestKey, lease.requestKey, description)
    if (state === 'completed') {
      assert.equal(decision.disposition, 'terminal-noop', description)
      assert.equal(decision.nextFencingTokenRequired, false, description)
    }
    if (decision.disposition === 'promote-and-resume' || decision.disposition === 'promote-and-verify') {
      assert.equal(leaseState, 'expired', description)
      assert.equal(healthState, 'abandoned', description)
      assert.equal(decision.nextFencingTokenRequired, true, description)
    }
    if (profile.consequenceClass === 'financial' && state === 'executing') {
      assert.notEqual(decision.disposition, 'promote-and-resume', description)
    }
    cases++
  }
  assert.equal(cases, 36)
})
