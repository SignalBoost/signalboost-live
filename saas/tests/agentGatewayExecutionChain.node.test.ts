// saas/tests/agentGatewayExecutionChain.node.test.ts
//
// Proves the automation-first ordering and, above all, the decline-vs-fail distinction: a
// declining executor passes the baton, a FAILING one stops the chain so an action that may
// already have had a partial effect is never re-attempted by a different route.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createExecutionChain,
  createUniversalChainExecutor,
  createBrowserChainExecutor,
  createManualChainExecutor,
} from '../agent-gateway-host/index.ts'
import type { ChainExecutor } from '../agent-gateway-host/index.ts'
import type { AgentRequest } from '../agent-gateway/types.ts'

function req(target: string, params?: Record<string, unknown>): AgentRequest {
  return {
    requestId: 'r-1',
    protocol: 'mcp',
    agentId: 'agent-1',
    action: { kind: 'tool_call', target, params },
  }
}

/** A recording stub so tests can assert exactly who was offered the request. */
function stub(id: string, attempt: ChainExecutor['attempt'], log: string[]): ChainExecutor {
  return {
    id,
    async attempt(request) {
      log.push(id)
      return attempt(request)
    },
  }
}

test('the chain tries executors in order and stops at the first that handles', async () => {
  const log: string[] = []
  const chain = createExecutionChain({
    executors: [
      stub('api', async () => ({ handled: false, reason: 'no API mapping' }), log),
      stub('browser', async () => ({ handled: true, ok: true, result: 'clicked' }), log),
      stub('manual', async () => ({ handled: true, ok: true }), log),
    ],
  })

  const result = await chain.perform(req('rotate_key'))
  assert.equal(result.ok, true)
  assert.equal(result.result, 'clicked')
  assert.deepEqual(log, ['api', 'browser'], 'manual was never reached')
})

test('DECLINE PASSES THE BATON: an unmapped API action falls through to the browser', async () => {
  const chain = createExecutionChain({
    executors: [
      createUniversalChainExecutor({ runUniversalProvider: async () => ({ ok: true, status: 200, outputs: {} }), actions: [] }),
      createBrowserChainExecutor({
        actions: [{ actionKind: 'tool_call', target: 'rotate_key', origin: 'https://vendor.example', plan: {} }],
        runBrowserAction: async () => ({ ok: true, result: 'done via UI' }),
      }),
    ],
  })

  const result = await chain.perform(req('rotate_key'))
  assert.equal(result.ok, true)
  assert.equal(result.result, 'done via UI')
})

test('FAILURE STOPS THE CHAIN: a broken provider call is never retried by another route', async () => {
  const log: string[] = []
  let browserRan = false

  const chain = createExecutionChain({
    executors: [
      stub('api', async () => ({ handled: true, ok: false, error: 'provider returned 502' }), log),
      stub('browser', async () => { browserRan = true; return { handled: true, ok: true } }, log),
    ],
  })

  const result = await chain.perform(req('charge_card'))
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /502/)
  assert.equal(browserRan, false, 'a 502 may still have had an effect — never re-attempt it elsewhere')
  assert.deepEqual(log, ['api'])
})

test('a THROWING executor is treated as failure, not decline', async () => {
  const log: string[] = []
  const chain = createExecutionChain({
    executors: [
      stub('api', async () => { throw new Error('socket hang up') }, log),
      stub('browser', async () => ({ handled: true, ok: true }), log),
    ],
  })

  const result = await chain.perform(req('send_wire'))
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /socket hang up/)
  assert.deepEqual(log, ['api'], 'it may have acted before throwing — the chain stops')
})

test('the browser executor declines honestly when no execution host is configured', async () => {
  // Chromium cannot run in a serverless function. Declining beats queueing work that will
  // never run — the "coded but never wired" trap.
  const executor = createBrowserChainExecutor({
    actions: [{ actionKind: 'tool_call', target: 'rotate_key', origin: 'https://vendor.example', plan: {} }],
  })
  const attempt = await executor.attempt(req('rotate_key'))
  assert.equal(attempt.handled, false)
  assert.match(attempt.handled === false ? attempt.reason ?? '' : '', /no browser execution host/)
})

test('THE BACKSTOP: when no machine can act, a person is assigned and told it is not done', async () => {
  const assigned: AgentRequest[] = []
  const chain = createExecutionChain({
    executors: [
      createUniversalChainExecutor({ runUniversalProvider: async () => ({ ok: true, status: 200, outputs: {} }), actions: [] }),
      createBrowserChainExecutor({ actions: [] }),
      createManualChainExecutor({
        recordManualTask: async (r) => { assigned.push(r); return { ok: true, reference: 'TASK-77' } },
      }),
    ],
  })

  const result = await chain.perform(req('call_the_vendor'))
  assert.equal(result.ok, true)
  assert.equal(assigned.length, 1)
  const payload = result.result as Record<string, unknown>
  assert.equal(payload.status, 'assigned_to_human')
  assert.equal(payload.reference, 'TASK-77')
  assert.match(String(payload.note), /NOT yet done/, 'assigned must never read as completed')
})

test('when every executor declines, the action is reported undone with who declined and why', async () => {
  const chain = createExecutionChain({
    executors: [
      createUniversalChainExecutor({ runUniversalProvider: async () => ({ ok: true, status: 200, outputs: {} }), actions: [] }),
      createBrowserChainExecutor({ actions: [] }),
    ],
  })
  const result = await chain.perform(req('unknown_thing'))
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /no executor could perform/)
  assert.match(result.error ?? '', /no API mapping/)
  assert.match(result.error ?? '', /no browser plan/)
})

test('the API executor keeps the closed-map discipline and parameter filtering', async () => {
  const calls: Array<Record<string, unknown>> = []
  const executor = createUniversalChainExecutor({
    runUniversalProvider: async (input) => { calls.push(input as unknown as Record<string, unknown>); return { ok: true, status: 200, outputs: { done: true } } },
    actions: [{ actionKind: 'tool_call', target: 'restart_worker', providerId: 'vercel', actionId: 'restart_worker', allowedParams: ['worker'] }],
  })

  await executor.attempt(req('restart_worker', { worker: 'render', callbackUrl: 'https://attacker.example' }))
  assert.deepEqual(calls[0].variables, { worker: 'render' }, 'the smuggled field never reached the provider')

  const unmapped = await executor.attempt(req('delete_everything'))
  assert.equal(unmapped.handled, false, 'unmapped declines rather than running')
})

test('onHandled reports which mechanism acted, for the audit trail', async () => {
  const seen: Array<{ id: string; ok: boolean }> = []
  const chain = createExecutionChain({
    executors: [
      { id: 'api', async attempt() { return { handled: false } } },
      { id: 'browser', async attempt() { return { handled: true, ok: true } } },
    ],
    onHandled: (id, _r, ok) => seen.push({ id, ok }),
  })
  await chain.perform(req('rotate_key'))
  assert.deepEqual(seen, [{ id: 'browser', ok: true }])
})
