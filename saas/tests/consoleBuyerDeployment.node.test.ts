// saas/tests/consoleBuyerDeployment.node.test.ts
//
// END-TO-END "buyer deployment" proof for the Console / Control Center. A buyer runs the
// real action engine (runAction) on their own EngineHost — their auth, their executors —
// and routes the provider-action audit trail into THEIR SIEM via createSiemConsoleLog.
// Asserts a key rotation succeeds and audits as a notice, a failed/denied action audits as
// high, validation failures never reach the log, and — critically — that raw input VALUES
// never leave in the SIEM record (keys only). Zero SignalBoost infrastructure.

import test from 'node:test'
import assert from 'node:assert/strict'
import { runAction, type EngineHost } from '../console-core/actionEngine.ts'
import { createSiemConsoleLog } from '../console-core/siem-log.ts'
import type { ActionSchema } from '../console-core/types.ts'
import type { SiemTransport } from '../portable-audit/index.ts'

function buyerConsole(opts: { allow?: boolean } = {}) {
  const siem: { record: string; meta: { eventType: string; severity: string } }[] = []
  const transport: SiemTransport = { send(record, meta) { siem.push({ record, meta }) } }
  const rotateSchema: ActionSchema = { id: 'rotate-key', label: 'Rotate API Key', verb: 'edit', fields: [{ id: 'newKey', label: 'New Key', type: 'text', required: true }] }
  const refundSchema: ActionSchema = { id: 'refund', label: 'Refund', verb: 'create', fields: [{ id: 'chargeId', label: 'Charge', type: 'text', required: true }] }
  const executors: Record<string, { schema: ActionSchema; run: (ctx: unknown, input: Record<string, unknown>) => Promise<{ ok: boolean; message?: string; error?: string }> }> = {
    'vault.rotate-key': { schema: rotateSchema, run: async () => ({ ok: true, message: 'rotated' }) },
    'stripe.refund': { schema: refundSchema, run: async () => ({ ok: false, error: 'payment gateway unavailable' }) },
  }
  const host: EngineHost = {
    auth: {
      async getCurrentUser() { return { id: 'buyer-admin', roles: ['owner'] } },
      hasPermission() { return opts.allow !== false },
    },
    log: createSiemConsoleLog({ siem: { transport, format: 'ecs-json', product: 'BuyerConsoleSOC', tenantId: 'acme', environment: 'prod' } }),
    resolveExecutor(providerId, actionId) { return executors[`${providerId}.${actionId}`] ?? null },
  }
  return { host, siem }
}
const ecs = (siem: { record: string }[]) => siem.map((r) => JSON.parse(r.record) as Record<string, unknown>)

test('a successful key rotation runs on the buyer host and audits as a notice — with NO secret value leaked', async () => {
  const { host, siem } = buyerConsole()
  const res = await runAction(host, { providerId: 'vault', actionId: 'rotate-key', input: { newKey: 'super-secret-k-123' } })
  assert.equal(res.ok, true)
  assert.equal(res.status, 200)
  const ev = ecs(siem).find((e) => e['event.action'] === 'console.action_success')
  assert.ok(ev, 'action_success reached the SIEM')
  assert.equal(ev!['log.level'], 'notice')
  const payload = ev!['portable.payload'] as Record<string, unknown>
  assert.equal(payload.providerId, 'vault')
  assert.equal(payload.actionId, 'rotate-key')
  assert.equal(payload.userId, 'buyer-admin')
  // inputSummary is KEYS ONLY; the raw secret must appear nowhere in the SIEM stream.
  assert.ok(String(payload.inputSummary).includes('newKey'))
  assert.ok(!siem.some((r) => r.record.includes('super-secret-k-123')), 'raw input value must never reach the SIEM')
})

test('a failing executor audits as high severity', async () => {
  const { host, siem } = buyerConsole()
  const res = await runAction(host, { providerId: 'stripe', actionId: 'refund', input: { chargeId: 'ch_1' } })
  assert.equal(res.ok, false)
  assert.equal(res.status, 400)
  const ev = ecs(siem).find((e) => e['event.action'] === 'console.action_error')
  assert.ok(ev, 'action_error reached the SIEM')
  assert.equal(ev!['log.level'], 'high')
})

test('a permission denial is audited as high with the reason', async () => {
  const { host, siem } = buyerConsole({ allow: false })
  const res = await runAction(host, { providerId: 'vault', actionId: 'rotate-key', input: { newKey: 'x' } })
  assert.equal(res.status, 403)
  const ev = ecs(siem).find((e) => e['event.action'] === 'console.action_error')
  assert.ok(ev)
  assert.equal((ev!['portable.payload'] as Record<string, unknown>).errorMessage, 'permission denied')
})

test('a validation failure never reaches the audit log (logging is post-validation)', async () => {
  const { host, siem } = buyerConsole()
  const res = await runAction(host, { providerId: 'vault', actionId: 'rotate-key', input: {} })
  assert.equal(res.status, 400)
  assert.equal(siem.length, 0)
})

test('every record carries the buyer SOC identity', async () => {
  const { host, siem } = buyerConsole()
  await runAction(host, { providerId: 'vault', actionId: 'rotate-key', input: { newKey: 'k' } })
  for (const p of ecs(siem)) {
    assert.equal(p['observer.product'], 'BuyerConsoleSOC')
    assert.equal(p['organization.id'], 'acme')
    assert.deepEqual(p['event.category'], ['configuration'])
  }
})
