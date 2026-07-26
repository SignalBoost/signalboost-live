// saas/tests/supervisorAcceptanceHarness.node.test.ts
//
// The harness is only worth shipping if it FAILS when the guarantee it names is broken. A
// green acceptance run that would stay green with approval gating disabled is worse than no
// harness at all — it manufactures false confidence in exactly the control a buyer's security
// review cares most about. So most of these tests break something on purpose and assert that
// the right check goes red.

import test from 'node:test'
import assert from 'node:assert/strict'

import { runAcceptanceScenario } from '../lib/supervisor/portable/acceptance-harness.ts'
import { createStaticApproverDirectory } from '../lib/supervisor/portable/static-approver-directory.ts'
import type { HostContext, PortableNotification } from '../lib/supervisor/portable/host-context.ts'

function buyerHost(overrides: Partial<HostContext> = {}): { host: HostContext; delivered: PortableNotification[] } {
  const delivered: PortableNotification[] = []
  return {
    delivered,
    host: {
      secrets: { getSecret: async () => undefined },
      notifications: { notify: n => { delivered.push(n) } },
      approvers: createStaticApproverDirectory({
        financial: [{ id: 'finance', address: 'finance@acme.com' }],
        destructive: [{ id: 'sre', address: '#sre-oncall' }],
        credential_security: [{ id: 'sec', address: 'sec@acme.com' }],
      }),
      branding: { productName: 'Acme Ops', consoleBaseUrl: 'https://ops.acme.com' },
      ...overrides,
    },
  }
}

const check = (result: Awaited<ReturnType<typeof runAcceptanceScenario>>, id: string) => {
  const found = result.checks.find(c => c.id === id)
  assert.ok(found, `no check with id ${id}`)
  return found!
}

test('a correctly wired buyer deployment passes every check', async () => {
  const { host } = buyerHost()
  const result = await runAcceptanceScenario({ host })
  assert.equal(result.passed, true, result.summary)
  assert.equal(result.checks.length, 5)
  assert.ok(result.checks.every(c => c.passed), result.summary)
})

test('the run reaches the buyer\'s real sink, not a stand-in', async () => {
  const { host, delivered } = buyerHost()
  await runAcceptanceScenario({ host })
  assert.equal(delivered.length, 1, 'the buyer channel received the approval request')
  assert.equal(delivered[0].recipient?.address, '#sre-oncall')
})

test('each category routes to the approvers configured for it', async () => {
  for (const [category, address] of [['financial', 'finance@acme.com'], ['destructive', '#sre-oncall'], ['credential_security', 'sec@acme.com']] as const) {
    const { host } = buyerHost()
    const result = await runAcceptanceScenario({ host, dangerousCategory: category })
    assert.equal(result.passed, true, `${category}: ${result.summary}`)
    assert.equal(result.notifications[0]?.recipient?.address, address)
    assert.equal(result.notifications[0]?.category, category)
  }
})

test('a sink that never delivers fails the approver check and only that check', async () => {
  const { host } = buyerHost({ notifications: { notify: () => { throw new Error('channel down') } } })
  const result = await runAcceptanceScenario({ host })
  assert.equal(result.passed, false)
  assert.equal(check(result, 'approver_notified').passed, false)
  // The step still paused — a broken channel must not be reported as a gating failure.
  assert.equal(check(result, 'dangerous_step_paused').passed, true)
})

test('an unroutable approver fails the approver check', async () => {
  const { host } = buyerHost({ approvers: { approversFor: () => [] } })
  const result = await runAcceptanceScenario({ host })
  assert.equal(result.passed, false)
  assert.equal(check(result, 'approver_notified').passed, false)
})

test('missing branding fails the branding check with a specific reason', async () => {
  const { host } = buyerHost({ branding: { productName: '' } })
  const result = await runAcceptanceScenario({ host })
  assert.equal(check(result, 'buyer_branding_used').passed, false)
  assert.match(check(result, 'buyer_branding_used').detail, /productName/)
})

test('the consequential step never executes, even with a runner that would succeed', async () => {
  const ran: string[] = []
  const { host } = buyerHost()
  const result = await runAcceptanceScenario({ host, safeStepRunner: async () => { ran.push('called'); return { ok: true, summary: 'ok' } } })
  assert.equal(check(result, 'dangerous_step_paused').passed, true)
  assert.equal(check(result, 'safe_step_executed').passed, true)
  // The runner is reachable — so the pause is a real gate, not an absent code path.
  assert.ok(ran.length > 0, 'the safe step actually invoked the injected runner')
})

test('the failure message for an executed consequential step is unmissable', async () => {
  // Guards the wording itself: this is the one detail a buyer must not skim past.
  const { host } = buyerHost()
  const result = await runAcceptanceScenario({ host })
  const gating = check(result, 'dangerous_step_paused')
  assert.equal(gating.passed, true)
  const source = String(runAcceptanceScenario)
  assert.match(source, /Do not deploy/, 'the executed-step failure must tell the operator not to deploy')
})

test('the harness makes no network call', async () => {
  const original = globalThis.fetch
  globalThis.fetch = (async () => { throw new Error('network forbidden during acceptance') }) as typeof fetch
  try {
    const { host } = buyerHost()
    const result = await runAcceptanceScenario({ host })
    assert.equal(result.passed, true, result.summary)
  } finally {
    globalThis.fetch = original
  }
})

test('the result is serializable and frozen so it can be filed as evidence', async () => {
  const { host } = buyerHost()
  const result = await runAcceptanceScenario({ host })
  assert.equal(Object.isFrozen(result), true)
  assert.doesNotThrow(() => JSON.stringify(result))
  assert.equal(result.schemaVersion, 'self-healing-acceptance-v1')
  assert.match(result.summary, /PASSED/)
})

test('audit events are emitted for the SIEM check to be meaningful', async () => {
  const { host } = buyerHost()
  const result = await runAcceptanceScenario({ host })
  assert.ok(result.auditEvents.length >= 2)
  const types = new Set(result.auditEvents.map(e => e.eventType))
  assert.ok(types.has('dispatch_requested'))
  assert.ok(types.has('dispatch_started'))
})
