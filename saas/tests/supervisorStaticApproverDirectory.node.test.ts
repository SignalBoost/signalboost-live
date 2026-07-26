// saas/tests/supervisorStaticApproverDirectory.node.test.ts
//
// The reference ApproverDirectory the Self-Healing Supervisor portable ships so a buyer can
// run an acceptance incident before writing an IdP adapter. The behaviour that matters is
// that misconfiguration is caught when the deployment is wired, not when a destructive step
// has already paused and the approval request has nobody to address.

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createStaticApproverDirectory,
  ApproverDirectoryConfigError,
  APPROVER_CATEGORIES,
} from '../lib/supervisor/portable/static-approver-directory.ts'
import { createEnterpriseNotifier } from '../lib/supervisor/portable/enterprise-notifier.ts'
import type { HostContext, PortableNotification } from '../lib/supervisor/portable/host-context.ts'

const sre = { id: 'sre-oncall', displayName: 'SRE On-Call', address: '#sre-oncall' }
const finance = { id: 'finance-approvers', displayName: 'Finance', address: 'finance@acme-corp.internal' }
const security = { id: 'sec-oncall', displayName: 'Security', address: 'sec@acme-corp.internal' }

test('every danger category must be covered before the directory can be built', () => {
  assert.throws(
    () => createStaticApproverDirectory({ destructive: [sre] }),
    (error: unknown) => error instanceof ApproverDirectoryConfigError && /financial/.test((error as Error).message) && /credential_security/.test((error as Error).message),
  )
})

test('a fallback is an explicit decision that one group approves everything', () => {
  const directory = createStaticApproverDirectory({ fallback: [sre] })
  for (const category of APPROVER_CATEGORIES) {
    assert.deepEqual(directory.approversFor(category), [sre])
  }
})

test('an explicit category wins over the fallback', () => {
  const directory = createStaticApproverDirectory({ financial: [finance], fallback: [sre] })
  assert.deepEqual(directory.approversFor('financial'), [finance])
  assert.deepEqual(directory.approversFor('destructive'), [sre])
})

test('unroutable approvers are rejected at construction', () => {
  assert.throws(() => createStaticApproverDirectory({ fallback: [{ id: '', address: 'x' }] }), ApproverDirectoryConfigError)
  assert.throws(() => createStaticApproverDirectory({ fallback: [{ id: 'a', address: '   ' }] }), ApproverDirectoryConfigError)
  assert.throws(() => createStaticApproverDirectory({ fallback: [] }), ApproverDirectoryConfigError)
  assert.throws(() => createStaticApproverDirectory({ fallback: [sre, { ...sre, address: 'other' }] }), ApproverDirectoryConfigError)
})

test('the resolved directory is frozen so a caller cannot mutate who may approve', () => {
  const directory = createStaticApproverDirectory({ fallback: [sre] })
  const approvers = directory.approversFor('destructive') as typeof sre[]
  assert.equal(Object.isFrozen(approvers), true)
  assert.equal(Object.isFrozen(approvers[0]), true)
  assert.throws(() => { (approvers as any).push(finance) })
})

test('approversFor never throws and never returns empty', () => {
  const directory = createStaticApproverDirectory({ financial: [finance], destructive: [sre], credential_security: [security] })
  for (const category of [...APPROVER_CATEGORIES, 'not_a_category' as never]) {
    const result = directory.approversFor(category)
    assert.ok(Array.isArray(result) && result.length > 0, `empty result for ${String(category)}`)
  }
})

test('a paused step routes to the right people through the real notifier', async () => {
  const delivered: PortableNotification[] = []
  const host: HostContext = {
    secrets: { getSecret: async () => undefined },
    notifications: { notify: n => { delivered.push(n) } },
    approvers: createStaticApproverDirectory({ financial: [finance], destructive: [sre, security], credential_security: [security] }),
    branding: { productName: 'Acme Ops', consoleBaseUrl: 'https://ops.acme-corp.internal' },
  }
  const notify = createEnterpriseNotifier(host)

  const pausedStep = (category: string, stepId: string, action: string) => ({
    dispatchId: `dispatch-${stepId}`,
    incidentId: `incident-${stepId}`,
    step: { stepId, action, description: `${action} description` },
    verdict: { category, reason: `${category} step requires approval` },
  }) as never

  await notify(pausedStep('financial', 'step-1', 'provider.update_plan'))
  assert.equal(delivered.length, 1, 'one financial approver is notified')
  assert.equal(delivered[0].recipient?.address, 'finance@acme-corp.internal')
  assert.equal(delivered[0].category, 'financial')
  assert.ok(delivered[0].title.includes('Acme Ops'), 'the buyer brand is used, never the build platform')

  delivered.length = 0
  await notify(pausedStep('destructive', 'step-2', 'provider.delete'))
  assert.equal(delivered.length, 2, 'both destructive approvers are notified')
  assert.deepEqual(delivered.map(d => d.recipient?.address).sort(), ['#sre-oncall', 'sec@acme-corp.internal'])
})

test('a directory that throws cannot take the executor down with it', async () => {
  // createEnterpriseNotifier swallows everything by design — the step has already halted and
  // a delivery failure must not become a second incident. That also means a broken directory
  // fails SILENTLY at runtime, which is precisely why createStaticApproverDirectory validates
  // at construction instead.
  const delivered: PortableNotification[] = []
  const host: HostContext = {
    secrets: { getSecret: async () => undefined },
    notifications: { notify: n => { delivered.push(n) } },
    approvers: { approversFor: () => { throw new Error('IdP unreachable') } },
    branding: { productName: 'Acme Ops' },
  }
  await createEnterpriseNotifier(host)({
    dispatchId: 'd', incidentId: 'i',
    step: { stepId: 's', action: 'a', description: 'd' },
    verdict: { category: 'destructive', reason: 'r' },
  } as never)
  assert.equal(delivered.length, 0, 'nothing delivered, and nothing thrown')
})
