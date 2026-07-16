import assert from 'node:assert/strict'
import test from 'node:test'
import { registerRenderer, runRender } from '../render-core/engine.ts'
import type { RenderExecutor, RenderHost } from '../render-core/types.ts'

function fakeExecutor(opts: { fail?: boolean } = {}): RenderExecutor {
  return {
    providerId: 'fake',
    kind: 'voice',
    estimateCostCents: (input) => String((input.params as { text?: unknown }).text || '').length,
    produce: async () => {
      if (opts.fail) throw new Error('provider blew up')
      return { bytes: new ArrayBuffer(8), contentType: 'audio/mpeg', units: 1 }
    },
  }
}

function fakeHost(balanceCents: number) {
  const state = { reserved: 0, refunded: 0, balance: balanceCents, persisted: 0 }
  const host: RenderHost = {
    wallet: {
      async reserve(_actor, cents) {
        if (cents > state.balance) return { ok: false, code: 'insufficient_funds', message: 'nope' }
        state.balance -= cents
        state.reserved += cents
        return { ok: true, reservationId: 'r1' }
      },
      async refund(_actor, _id) {
        state.balance += state.reserved
        state.refunded += state.reserved
      },
    },
    storage: { async persist() { state.persisted += 1; return { url: 'https://fake/out.mp3' } } },
    log: { log: () => {} },
    resolvePlatformKey: () => 'platform-key',
  }
  return { host, state }
}

const actor = { userId: 'u1' }
const input = { providerId: 'fake', kind: 'voice' as const, params: { text: 'hello world' }, paidProviderApprovalId: 'approval-1' }

test('wallet mode: reserves before producing, returns url', async () => {
  registerRenderer(fakeExecutor())
  const { host, state } = fakeHost(1000)
  const res = await runRender(host, actor, input, { mode: 'wallet' })
  assert.equal(res.ok, true)
  assert.equal(state.reserved, 11)
  assert.equal(state.persisted, 1)
  if (res.ok) assert.equal(res.charged, true)
})


test('wallet mode blocks paid providers without owner approval', async () => {
  registerRenderer(fakeExecutor())
  const { host, state } = fakeHost(1000)
  const res = await runRender(host, actor, { providerId: 'fake', kind: 'voice', params: { text: 'hello world' } }, { mode: 'wallet' })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.code, 'approval_required')
  assert.equal(state.reserved, 0)
  assert.equal(state.persisted, 0)
})

test('insufficient funds: never calls the provider', async () => {
  registerRenderer(fakeExecutor())
  const { host, state } = fakeHost(5)
  const res = await runRender(host, actor, input, { mode: 'wallet' })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.code, 'insufficient_funds')
  assert.equal(state.persisted, 0)
})

test('provider failure refunds the reservation', async () => {
  registerRenderer(fakeExecutor({ fail: true }))
  const { host, state } = fakeHost(1000)
  const res = await runRender(host, actor, input, { mode: 'wallet' })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.code, 'provider_failed')
  assert.equal(state.refunded, 11)
  assert.equal(state.balance, 1000)
})

test('BYOK mode: no reservation, no charge, still produces', async () => {
  registerRenderer(fakeExecutor())
  const { host, state } = fakeHost(0)
  const res = await runRender(host, actor, input, { mode: 'byok', apiKey: 'user-key' })
  assert.equal(res.ok, true)
  assert.equal(state.reserved, 0)
  if (res.ok) assert.equal(res.charged, false)
})

test('unknown provider: clean no_executor error', async () => {
  const { host } = fakeHost(1000)
  const res = await runRender(host, actor, { providerId: 'nope', kind: 'voice', params: {} }, { mode: 'wallet' })
  assert.equal(res.ok, false)
  if (!res.ok) assert.equal(res.code, 'no_executor')
})
