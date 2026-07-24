import test from 'node:test'
import assert from 'node:assert/strict'
import type { PortableBrowserSessionPort } from '../lib/portable-browser/browser-session-port.ts'
import type { PortableBrowserSessionRef, PortableBrowserTenantScope } from '../lib/portable-browser/browser-runtime-types.ts'
import { PortableBrowserSessionLifecycleManager } from '../lib/portable-browser/browser-session-lifecycle-manager.ts'

const scope: PortableBrowserTenantScope = Object.freeze({
  tenantId: 'buyer-a',
  approvedOrigins: Object.freeze(['http://localhost:4173']),
  readOnly: true,
  cancellationRequested: false,
  killSwitchEnabled: false,
})

function createHarness() {
  let now = 1_000
  let sequence = 0
  const closed: string[] = []
  let closeFailureFor: string | undefined
  const port: PortableBrowserSessionPort = {
    create: async () => ({ sessionId: `session-${++sequence}` }),
    navigate: async () => undefined,
    observe: async () => ({ origin: 'http://localhost:4173', allowedSelectors: [] }),
    perform: async () => undefined,
    captureEvidence: async () => ({ referenceId: 'evidence-1' }),
    pause: async () => undefined,
    resume: async () => undefined,
    requestHumanTakeover: async () => ({ referenceId: 'takeover-1' }),
    close: async (session: PortableBrowserSessionRef) => {
      if (session.sessionId === closeFailureFor) throw new Error('password=do-not-leak')
      closed.push(session.sessionId)
    },
  }
  const manager = new PortableBrowserSessionLifecycleManager({
    sessionPort: port,
    clock: { now: () => now },
    maximumConcurrentSessions: 2,
    maximumSessionAgeMs: 100,
  })
  return {
    manager,
    closed,
    advance(ms: number) { now += ms },
    failClose(sessionId: string) { closeFailureFor = sessionId },
  }
}

test('opens, tracks, touches, and closes buyer-owned sessions', async () => {
  const harness = createHarness()
  const session = await harness.manager.open(scope)
  harness.advance(25)
  harness.manager.touch(session.sessionId)
  await harness.manager.close(session.sessionId)

  assert.deepEqual(harness.closed, ['session-1'])
  assert.deepEqual(harness.manager.snapshot(), [{
    sessionId: 'session-1',
    tenantId: 'buyer-a',
    state: 'closed',
    openedAt: 1_000,
    lastActivityAt: 1_025,
    expiresAt: 1_100,
    closeReason: 'requested',
    error: undefined,
  }])
})

test('reaps expired sessions deterministically and frees capacity', async () => {
  const harness = createHarness()
  await harness.manager.open(scope)
  await harness.manager.open(scope)
  await assert.rejects(harness.manager.open(scope), /capacity_exceeded/)

  harness.advance(100)
  assert.deepEqual(await harness.manager.reapExpired(), ['session-1', 'session-2'])
  assert.deepEqual(harness.closed, ['session-1', 'session-2'])
  assert.equal(harness.manager.health().expiredSessions, 2)
  assert.equal((await harness.manager.open(scope)).sessionId, 'session-3')
})

test('shutdown closes every active session in stable order', async () => {
  const harness = createHarness()
  await harness.manager.open(scope)
  await harness.manager.open(scope)

  assert.deepEqual(await harness.manager.shutdown(), ['session-1', 'session-2'])
  assert.deepEqual(harness.closed, ['session-1', 'session-2'])
  assert.equal(harness.manager.health().activeSessions, 0)
})

test('retains cleanup failures as degraded sanitized diagnostics', async () => {
  const harness = createHarness()
  const session = await harness.manager.open(scope)
  harness.failClose(session.sessionId)

  await assert.rejects(harness.manager.close(session.sessionId), error => {
    assert.match(String(error), /\[redacted\]/)
    assert.doesNotMatch(String(error), /do-not-leak/)
    return true
  })
  const health = harness.manager.health()
  assert.equal(health.status, 'degraded')
  assert.equal(health.failedSessions, 1)
  assert.equal(harness.manager.snapshot()[0]?.state, 'failed')
})

test('fails closed for invalid limits, clocks, and duplicate session identities', async () => {
  const harness = createHarness()
  assert.throws(() => new PortableBrowserSessionLifecycleManager({
    sessionPort: {} as PortableBrowserSessionPort,
    clock: { now: () => 0 },
    maximumConcurrentSessions: 1,
    maximumSessionAgeMs: 1,
  }), /session_port_required/)

  const duplicatePort = {
    ...({} as PortableBrowserSessionPort),
    create: async () => ({ sessionId: 'same' }),
    close: async () => undefined,
  }
  const manager = new PortableBrowserSessionLifecycleManager({
    sessionPort: duplicatePort,
    clock: { now: () => 0 },
    maximumConcurrentSessions: 2,
    maximumSessionAgeMs: 10,
  })
  await manager.open(scope)
  await assert.rejects(manager.open(scope), /identity_invalid/)

  const invalidClock = new PortableBrowserSessionLifecycleManager({
    sessionPort: duplicatePort,
    clock: { now: () => Number.NaN },
    maximumConcurrentSessions: 1,
    maximumSessionAgeMs: 10,
  })
  await assert.rejects(invalidClock.open(scope), /clock_invalid/)
})
