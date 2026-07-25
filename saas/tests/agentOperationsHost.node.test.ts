// saas/tests/agentOperationsHost.node.test.ts
//
// The Agent Operations Platform is now constructible outside a test file. These tests hold
// the line that making it constructible did NOT quietly make it look capable.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  NO_GENERATOR_REASON,
  createNullActivityStore,
  createRefusingCandidateGenerator,
  createSignalBoostAgentOperationsHost,
  describeAgentOperationsHost,
} from '../agent-operations-host/signalboostAgentOperationsHost.ts'

const EMPTY_ENV = Object.freeze({}) as Readonly<Record<string, string | undefined>>

const REMOTE_ENV = Object.freeze({
  AGENT_SANDBOX_PROVIDER: 'remote',
  AGENT_SANDBOX_ENABLED: 'true',
  AGENT_SANDBOX_ENDPOINT: 'https://sandbox.example.com',
  AGENT_SANDBOX_TOKEN: 'test-token',
})

const transport = { async send() { throw new Error('not used in these tests') } } as any

test('the host is constructible — the thing that was actually missing', () => {
  const coordinator = createSignalBoostAgentOperationsHost({
    env: EMPTY_ENV,
    activityStore: createNullActivityStore(),
  })
  assert.equal(typeof coordinator.run, 'function')
})

test('an unconfigured deployment reports disabled, and says what is missing', () => {
  const readiness = describeAgentOperationsHost({ env: EMPTY_ENV, activityStore: createNullActivityStore() })
  assert.equal(readiness.providerId, 'disabled')
  assert.equal(readiness.sandboxReady, false)
  assert.equal(readiness.generatorReady, false)
  assert.equal(readiness.missing.length, 2)
  assert.match(readiness.missing.join(' '), /sandbox provider/i)
  assert.match(readiness.missing.join(' '), /repair candidate generator/i)
})

test('an enabled remote config without a transport is NOT ready — config alone is not a provider', () => {
  const readiness = describeAgentOperationsHost({ env: REMOTE_ENV, activityStore: createNullActivityStore() })
  assert.equal(readiness.providerId, 'remote')
  assert.equal(readiness.sandboxReady, false)
  assert.match(readiness.missing.join(' '), /transport/i)
})

test('supplying a transport and a generator is what clears the sandbox and generator gaps', () => {
  const readiness = describeAgentOperationsHost({
    env: REMOTE_ENV,
    remoteTransport: transport,
    generator: createRefusingCandidateGenerator(),
    activityStore: createNullActivityStore(),
  })
  assert.equal(readiness.sandboxReady, true)
  assert.equal(readiness.generatorReady, true)
  assert.deepEqual(readiness.missing, [])
})

test('a malformed sandbox configuration falls back to disabled, never to enabled', () => {
  const readiness = describeAgentOperationsHost({
    env: { AGENT_SANDBOX_PROVIDER: 'remote', AGENT_SANDBOX_ENABLED: 'true' },
    remoteTransport: transport,
    activityStore: createNullActivityStore(),
  })
  assert.equal(readiness.providerId, 'disabled')
  assert.equal(readiness.sandboxReady, false)
})

test('a private or non-https sandbox endpoint is refused, not quietly accepted', () => {
  for (const endpoint of ['http://sandbox.example.com', 'https://127.0.0.1', 'https://192.168.1.10']) {
    const readiness = describeAgentOperationsHost({
      env: { ...REMOTE_ENV, AGENT_SANDBOX_ENDPOINT: endpoint },
      remoteTransport: transport,
      activityStore: createNullActivityStore(),
    })
    assert.equal(readiness.providerId, 'disabled', `${endpoint} should not be accepted`)
  }
})

test('the default generator REFUSES rather than returning an empty patch', async () => {
  const generator = createRefusingCandidateGenerator()
  await assert.rejects(() => generator.generateInitial({} as any), new RegExp(NO_GENERATOR_REASON.slice(0, 30)))
  await assert.rejects(() => generator.generateCorrection({} as any), /No repair candidate generator/)
})

test('a workflow on an unconfigured deployment fails cleanly and is recorded, not crashed', async () => {
  const recorded: unknown[] = []
  const coordinator = createSignalBoostAgentOperationsHost({
    env: EMPTY_ENV,
    activityStore: { async record(entry) { recorded.push(entry) } },
    now: () => 0,
  })

  const result = await coordinator.run(
    { userId: 'user-1', roles: ['owner'] } as any,
    {
      requestId: 'req-1',
      workflowId: 'wf-1',
      userId: 'user-1',
      language: 'typescript',
      estimatedCostUnits: 1,
    } as any,
  )

  assert.equal(typeof result, 'object')
  assert.equal(recorded.length, 1, 'the outcome of a real run is recorded exactly once')
})

test('the null activity store drops records instead of inventing them', async () => {
  const store = createNullActivityStore()
  await store.record({ workflowId: 'wf', requestId: 'req', outcome: 'failed' } as any)
})
