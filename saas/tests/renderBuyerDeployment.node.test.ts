// saas/tests/renderBuyerDeployment.node.test.ts
//
// END-TO-END "buyer deployment" proof for the Render portable. Stands render-core up
// on interfaces a BUYER supplies — an in-memory wallet, storage, platform-key resolver,
// and paid-provider approval issuer — with NO SignalBoost infrastructure, and routes the
// audit trail into a MOCK BUYER SIEM via the real createSiemRenderLog bridge. Asserts the
// portable runs across every money path AND that each event lands in the buyer's SIEM at
// the right severity. This is the "enterprise plug-and-play, zero host coupling" claim,
// demonstrated rather than asserted.

import test from 'node:test'
import assert from 'node:assert/strict'
import { runRender, registerRenderer } from '../render-core/engine.ts'
import { createSiemRenderLog } from '../render-core/siem-log.ts'
import type {
  PaidProviderApprovalAdapter,
  RenderExecutor,
  RenderHost,
  RenderInput,
  StorageAdapter,
  WalletAdapter,
} from '../render-core/types.ts'
import type { SiemTransport } from '../portable-audit/index.ts'

// --- a buyer's stack, entirely fakes; no SignalBoost imports anywhere below ---
function buyerStack(opts: { withApprovals?: boolean; balanceCents?: number } = {}) {
  const siem: { record: string; meta: { eventType: string; severity: string; format: string } }[] = []
  const transport: SiemTransport = { send(record, meta) { siem.push({ record, meta }) } }
  const wallet = { reserved: 0, refunded: [] as string[] }
  let balance = opts.balanceCents ?? 100_000
  const walletAdapter: WalletAdapter = {
    async reserve(_actor, cents) {
      if (cents > balance) return { ok: false, code: 'insufficient_funds', message: 'buyer wallet empty' }
      balance -= cents; wallet.reserved += cents
      return { ok: true, reservationId: `buyer-res-${wallet.reserved}` }
    },
    async refund(_actor, reservationId) { wallet.refunded.push(reservationId) },
  }
  const storage: StorageAdapter = { async persist(_b, _ct, keyHint) { return { url: `buyer-store://${keyHint}` } } }
  const approvals: PaidProviderApprovalAdapter = { async issue(req) { return { ok: true, approvalId: `buyer-appr-${req.providerId}` } } }
  const host: RenderHost = {
    wallet: walletAdapter,
    storage,
    log: createSiemRenderLog({ siem: { transport, format: 'ecs-json', product: 'BuyerRenderSOC', tenantId: 'acme', environment: 'prod' } }),
    resolvePlatformKey: () => 'buyer-platform-key',
    ...(opts.withApprovals === false ? {} : { approvals }),
  }
  return { host, siem, wallet }
}
const flush = () => new Promise((r) => setImmediate(r))
const ecs = (siem: { record: string }[]) => siem.map((r) => JSON.parse(r.record) as Record<string, unknown>)

const good: RenderExecutor = { providerId: 'buyer-tts', kind: 'voice', estimateCostCents: () => 250, async produce() { return { bytes: new ArrayBuffer(8), contentType: 'audio/mpeg', units: 1200 } } }
const failing: RenderExecutor = { providerId: 'buyer-fail', kind: 'voice', estimateCostCents: () => 250, async produce() { throw new Error('buyer provider unavailable') } }
registerRenderer(good); registerRenderer(failing)
const actor = { userId: 'buyer-user-1' }
const goodInput: RenderInput = { providerId: 'buyer-tts', kind: 'voice', params: { text: 'hello' } }
const failInput: RenderInput = { providerId: 'buyer-fail', kind: 'voice', params: {} }

test('wallet-funded render runs on the buyer stack and lands render.ok in the buyer SIEM', async () => {
  const { host, siem, wallet } = buyerStack()
  const res = await runRender(host, actor, goodInput, { mode: 'wallet' })
  assert.equal(res.ok, true)
  assert.match(res.url ?? '', /^buyer-store:\/\//)
  assert.equal(res.charged, true)
  assert.equal(res.providerCostCents, 250)
  assert.equal(res.paidProviderApprovalId, 'buyer-appr-buyer-tts')
  assert.equal(wallet.reserved, 250)
  await flush()
  const events = ecs(siem)
  const ok = events.find((e) => e['event.action'] === 'render.ok')
  assert.ok(ok, 'render.ok reached the SIEM')
  assert.equal(ok!['log.level'], 'notice')
  assert.equal(ok!['observer.product'], 'BuyerRenderSOC')
  assert.equal(ok!['organization.id'], 'acme')
  assert.equal((ok!['portable.payload'] as Record<string, string>).charged, 'true')
  assert.ok(events.some((e) => e['event.action'] === 'render.approval_issued'))
})

test('no approval issuer -> render blocked, approval_required lands as a warning, wallet untouched', async () => {
  const { host, siem, wallet } = buyerStack({ withApprovals: false })
  const res = await runRender(host, actor, goodInput, { mode: 'wallet' })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'approval_required')
  assert.equal(wallet.reserved, 0)
  await flush()
  const ev = ecs(siem).find((e) => e['event.action'] === 'render.approval_required')
  assert.ok(ev, 'approval_required reached the SIEM')
  assert.equal(ev!['log.level'], 'warning')
})

test('provider failure -> refund happens and render.provider_failed lands as high severity', async () => {
  const { host, siem, wallet } = buyerStack()
  const res = await runRender(host, actor, failInput, { mode: 'wallet' })
  assert.equal(res.ok, false)
  assert.equal(res.code, 'provider_failed')
  assert.equal(wallet.refunded.length, 1)
  await flush()
  const ev = ecs(siem).find((e) => e['event.action'] === 'render.provider_failed')
  assert.ok(ev, 'provider_failed reached the SIEM')
  assert.equal(ev!['log.level'], 'high')
})

test('BYOK render bypasses the wallet, still produces, and audits as an uncharged render', async () => {
  const { host, siem, wallet } = buyerStack()
  const res = await runRender(host, actor, goodInput, { mode: 'byok', apiKey: 'user-own-key' })
  assert.equal(res.ok, true)
  assert.equal(res.charged, false)
  assert.equal(wallet.reserved, 0)
  await flush()
  const ok = ecs(siem).find((e) => e['event.action'] === 'render.ok')
  assert.equal((ok!['portable.payload'] as Record<string, string>).charged, 'false')
})

test('every emitted record is well-formed and carries the buyer SOC identity (zero seller coupling)', async () => {
  const { host, siem } = buyerStack()
  await runRender(host, actor, goodInput, { mode: 'wallet' })
  await flush()
  assert.ok(siem.length > 0)
  for (const r of siem) {
    const parsed = JSON.parse(r.record) as Record<string, unknown>
    assert.equal(parsed['observer.product'], 'BuyerRenderSOC')
    assert.equal(parsed['service.environment'], 'prod')
    assert.equal(r.meta.format, 'ecs-json')
  }
})
