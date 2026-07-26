// saas/tests/supervisorPortableHostContext.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createEnterpriseNotifier } from '../lib/supervisor/portable/enterprise-notifier.ts'
import type { HostContext, PortableNotification } from '../lib/supervisor/portable/host-context.ts'

function buyerHost(overrides: Partial<HostContext> = {}): { host: HostContext; delivered: PortableNotification[] } {
  const delivered: PortableNotification[] = []
  const host: HostContext = {
    secrets: { getSecret: async () => undefined },
    branding: { productName: 'Acme SecOps', consoleBaseUrl: 'https://ops.acme-corp.internal' },
    approvers: {
      approversFor: category => category === 'financial'
        ? [{ id: 'u1', displayName: 'Finance', address: 'finance@acme-corp.internal' }]
        : [{ id: 'u2', displayName: 'SRE', address: '#sre-oncall' }, { id: 'u3', displayName: 'Sec', address: 'sec@acme-corp.internal' }],
    },
    notifications: { notify: n => { delivered.push(n) } },
    ...overrides,
  }
  return { host, delivered }
}

const step = (description: string) => ({ stepId: 's2', action: 'api_request', description, protectedAction: true, parameters: {} }) as never

test('routes a paused step to every resolved approver via the buyer sink', async () => {
  const { host, delivered } = buyerHost()
  const notify = createEnterpriseNotifier(host)
  await notify({ dispatchId: 'D1', incidentId: 'INC1', step: step('rotate the api key'), verdict: { dangerous: true, category: 'credential_security', reason: 'Credentials.' } as never })
  assert.equal(delivered.length, 2)
  assert.ok(delivered.some(d => d.recipient?.address === '#sre-oncall'))
  assert.ok(delivered.some(d => d.recipient?.address === 'sec@acme-corp.internal'))
})

test('uses the buyer product name and console host, never the build platform', async () => {
  const { host, delivered } = buyerHost()
  await createEnterpriseNotifier(host)({ dispatchId: 'D', incidentId: 'I', step: step('drop table'), verdict: { dangerous: true, category: 'destructive', reason: 'r' } as never })
  assert.ok(delivered[0].title.includes('Acme SecOps'))
  assert.ok((delivered[0].consoleUrl || '').startsWith('https://ops.acme-corp.internal'))
})

test('different danger categories resolve different approver sets', async () => {
  const { host, delivered } = buyerHost()
  await createEnterpriseNotifier(host)({ dispatchId: 'D', incidentId: 'I', step: step('issue refund'), verdict: { dangerous: true, category: 'financial', reason: 'Money.' } as never })
  assert.equal(delivered.length, 1)
  assert.equal(delivered[0].recipient?.address, 'finance@acme-corp.internal')
})

test('empty directory still emits one event so nothing is lost', async () => {
  const { host, delivered } = buyerHost({ approvers: { approversFor: () => [] } })
  await createEnterpriseNotifier(host)({ dispatchId: 'D', incidentId: 'I', step: step('x'), verdict: { dangerous: true, category: 'destructive', reason: 'r' } as never })
  assert.equal(delivered.length, 1)
})

test('a sink failure never throws back into the executor', async () => {
  const { host } = buyerHost({ notifications: { notify: () => { throw new Error('SIEM down') } } })
  await createEnterpriseNotifier(host)({ dispatchId: 'D', incidentId: 'I', step: step('x'), verdict: { dangerous: true, category: 'destructive', reason: 'r' } as never })
})

test('the whole buyer import graph has zero host coupling, except touchpoints named here', () => {
  const entries = [
    '../lib/supervisor/portable/index.ts',
    '../lib/supervisor/executors/create-supervisor-dispatcher.ts',
  ]

  const known = new Map([
    ['lib/supervisor/executors/create-supervisor-dispatcher.ts',
      'lazy import of the platform email notifier, reached only when the buyer supplies neither a HostContext nor a notifier'],
    ['lib/supervisor/executors/api-executor.ts',
      'lazy import of the platform provider engine as the DEFAULT api step runner; a buyer passes their own runner'],
    ['lib/supervisor/executors/dispatch-store.ts',
      'process.env is confined to platformSupervisorRuntime(), a platform-only helper the buyer never calls'],
  ])

  const seen = new Set()
  const found = new Map()
  const root = fileURLToPath(new URL('..', import.meta.url))

  const walk = (file) => {
    if (seen.has(file) || !existsSync(file)) return
    seen.add(file)
    const raw = readFileSync(file, 'utf8')
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    const hits = []
    if (/process\.env/.test(code)) hits.push('process.env')
    if (/signalboost/i.test(code)) hits.push('names the build platform')
    if (/@\/lib\//.test(code)) hits.push('imports a host singleton')
    if (hits.length) found.set(relative(root, file), hits.join(' + '))
    for (const match of code.matchAll(/from\s+'(\.[^']+)'/g)) {
      const base = resolve(dirname(file), match[1])
      for (const candidate of [base, `${base}.ts`, resolve(base, 'index.ts')]) {
        if (existsSync(candidate) && candidate.endsWith('.ts')) { walk(candidate); break }
      }
    }
  }
  for (const entry of entries) walk(fileURLToPath(new URL(entry, import.meta.url)))

  assert.ok(seen.size > 40, `expected to walk the real graph, only reached ${seen.size} modules`)
  const unexpected = [...found.keys()].filter(f => !known.has(f))
  assert.deepEqual(unexpected, [], `new host coupling in the buyer import graph: ${unexpected.map(f => `${f} (${found.get(f)})`).join('; ')}`)
})

test('the portable boundary modules themselves are unconditionally clean', () => {
  for (const name of ['host-context.ts', 'enterprise-notifier.ts', 'enterprise-dispatch-store.ts', 'siem-audit-sink.ts', 'index.ts']) {
    const file = fileURLToPath(new URL(`../lib/supervisor/portable/${name}`, import.meta.url))
    const raw = readFileSync(file, 'utf8')
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n')
    assert.ok(!/signalboost/i.test(code), `${name} names the build platform`)
    assert.ok(!/process\.env/.test(code), `${name} reads process.env`)
    assert.ok(!/@\/lib\//.test(code), `${name} imports a host singleton`)
  }
})

import { EnterpriseDispatchStore } from '../lib/supervisor/portable/enterprise-dispatch-store.ts'
import { createSupervisorDispatcher } from '../lib/supervisor/executors/create-supervisor-dispatcher.ts'

test('enterprise dispatch store: durable at-most-once with a buyer SQL driver', async () => {
  const keys = new Set<string>()
  const sql = { execute: async (_s: string, p: readonly unknown[]) => { const id = String(p[0]); if (keys.has(id)) { const e = new Error('duplicate') as Error & { code?: string }; e.code = '23505'; throw e } keys.add(id) } }
  const store = new EnterpriseDispatchStore({ sql })
  const c = (id: string) => ({ dispatchId: id, incidentId: 'i', executorKind: 'api', claimedAt: 't' })
  assert.equal(await store.claim(c('d1')), true)
  assert.equal(await store.claim(c('d1')), false)
  assert.equal(await store.claim(c('d2')), true)
})

test('enterprise dispatch store: rejects a malicious table name', () => {
  const sql = { execute: async () => {} }
  assert.throws(() => new EnterpriseDispatchStore({ sql, tableName: 'x; DROP TABLE y;--' }))
})

test('factory: HostContext wires the enterprise notifier, no platform email', async () => {
  const delivered: unknown[] = []
  const host = {
    secrets: { getSecret: async () => undefined },
    branding: { productName: 'Acme SecOps', consoleBaseUrl: 'https://ops.acme.internal' },
    approvers: { approversFor: () => [{ id: 'u', address: '#sre' }] },
    notifications: { notify: (n: unknown) => { delivered.push(n) } },
  } as never
  const dispatcher = createSupervisorDispatcher({ audit: { write: async () => {} }, apiRunner: async () => ({ ok: true, summary: 'ok' }), host })
  const T = '2026-07-16T00:00:00.000Z'
  const danger = { incident: { incidentId: 'INC', provider: 'vercel', environment: 'sandbox', severity: 'warning', detectedAt: T, source: 'api', errorMessage: 'x', evidence: [{ evidenceId: 'e', type: 'log', capturedAt: T, summary: 'x' }], metadata: {} }, plan: { planId: 'P', incidentId: 'INC', diagnosis: 'x', confidenceScore: 80, requiresBrowser: false, riskLevel: 'low', targetProvider: 'vercel', targetEnvironment: 'sandbox', steps: [{ stepId: 's1', action: 'api_request', description: 'delete the database', protectedAction: false, parameters: { actionId: 'drop' } }], verificationSteps: [{ stepId: 'v', action: 'verify', description: 'v', protectedAction: false, parameters: {} }], generatedAt: T, schemaVersion: 'supervisor-plan-v1' }, policyDecision: { outcome: 'approved', reason: 'x', evaluatedAt: T, policyVersion: 'v', approvedStepIds: ['s1'] }, approvedStepIds: ['s1'], executionContext: { executionId: 'E', metadata: {} }, dispatchId: 'D-ent', requestedExecutorKind: 'api' } as never
  const r = await dispatcher.dispatch(danger)
  assert.equal(r.status, 'paused_for_approval')
  assert.equal(delivered.length, 1)
})
