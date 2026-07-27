// saas/tests/supervisorEntitlementWiring.node.test.ts
//
// The licence, actually enforced.
//
// Until this wiring existed the manifest said `licensingAvailable: true`, which meant
// only that a token could be issued. Nothing checked one. These tests are the
// difference: they mint a REAL Ed25519 licence with the real issuer script's library,
// and assert that the same code path refuses without it and permits with it.
//
// The negative case is the important one. A licence check that passes when
// misconfigured is not a licence check, so "no token installed" must refuse rather
// than fall open — including on the vendor's own deployment, which licenses itself
// like anyone else.

import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'

import { issueLicense } from '../portable-license/issue.ts'
import { featuresForEdition } from '../portable-license/catalog.ts'

const PRODUCT = 'self-healing-supervisor'
const ISSUER = 'signalboost'

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  return {
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    privateKeyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  }
}

async function withEnv<T>(env: Record<string, string | undefined>, run: (mod: typeof import('../self-healing-host/supervisor-entitlement.ts')) => Promise<T>): Promise<T> {
  const saved = { ...process.env }
  for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_LICENSE')) delete process.env[key]
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  const mod = await import('../self-healing-host/supervisor-entitlement.ts')
  mod.resetSupervisorEntitlementForTests()
  try {
    return await run(mod)
  } finally {
    mod.resetSupervisorEntitlementForTests()
    for (const key of Object.keys(process.env)) if (key.startsWith('SUPERVISOR_LICENSE')) delete process.env[key]
    Object.assign(process.env, saved)
  }
}


// Claims are built explicitly rather than through a convenience wrapper, because the
// real issuer takes the full claim set and a fixture that diverges from it proves
// nothing about the path a buyer's licence actually travels.
function claimsFor(overrides: Record<string, unknown> = {}) {
  const now = Date.now()
  return {
    schema: 'portable-license/1' as const,
    licenseId: `lic-${Math.random().toString(36).slice(2, 10)}`,
    issuer: ISSUER,
    licensee: 'Acme Corp',
    productId: PRODUCT,
    edition: 'enterprise',
    features: featuresForEdition(PRODUCT, 'enterprise') ?? ['repair.plan', 'repair.dispatch'],
    seats: null,
    maxExecutions: null,
    issuedAt: new Date(now - 1000).toISOString(),
    notBefore: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 90 * 24 * 3600 * 1000).toISOString(),
    graceDays: 0,
    ...overrides,
  }
}

const thinkerStub = () => {
  const calls: string[] = []
  return {
    calls,
    proposeRepairPlan(incident: { incidentId: string }) { calls.push(incident.incidentId); return { planId: 'p1' } },
  }
}

test('with no licence installed, proposing a repair plan is REFUSED', async () => {
  // The whole point. Before this wiring the same call succeeded.
  await withEnv({}, async (mod) => {
    const wiring = mod.getSupervisorEntitlement()
    assert.equal(wiring.configured, false)
    assert.ok(wiring.reason.includes('SUPERVISOR_LICENSE_TOKEN'), 'the reason must name the missing variable')

    const stub = thinkerStub()
    const guarded = mod.licensedThinker(stub)
    await assert.rejects(() => guarded.proposeRepairPlan({ incidentId: 'i-1' }) as Promise<unknown>)
    assert.deepEqual(stub.calls, [], 'the refusal happens before the implementation runs')
  })
})

test('the refusal names each missing variable separately', async () => {
  // "Licensing is not configured" sends an operator hunting. Naming the variables
  // does not.
  await withEnv({ SUPERVISOR_LICENSE_TOKEN: 'x' }, async (mod) => {
    const { reason } = mod.getSupervisorEntitlement()
    assert.ok(reason.includes('SUPERVISOR_LICENSE_ISSUER'))
    assert.ok(reason.includes('PUBLIC_KEYS'))
    assert.ok(!reason.includes('SUPERVISOR_LICENSE_TOKEN'), 'a variable that IS set must not be reported missing')
  })
})

test('a malformed public key refuses rather than throwing on the first incident', async () => {
  await withEnv({
    SUPERVISOR_LICENSE_TOKEN: 'portable-license.1.abc.def',
    SUPERVISOR_LICENSE_ISSUER: ISSUER,
    SUPERVISOR_LICENSE_PUBLIC_KEYS: 'not a pem at all',
  }, async (mod) => {
    const wiring = mod.getSupervisorEntitlement()
    assert.equal(wiring.configured, false, 'a key with no PEM header is no key')
    const stub = thinkerStub()
    await assert.rejects(() => mod.licensedThinker(stub).proposeRepairPlan({ incidentId: 'i-2' }) as Promise<unknown>)
  })
})

test('with a VALID licence, proposing a repair plan is permitted', async () => {
  const { publicKeyPem, privateKeyPem } = keyPair()
  const token = issueLicense(claimsFor(), privateKeyPem)

  await withEnv({
    SUPERVISOR_LICENSE_TOKEN: token,
    SUPERVISOR_LICENSE_ISSUER: ISSUER,
    SUPERVISOR_LICENSE_PUBLIC_KEYS: publicKeyPem,
  }, async (mod) => {
    assert.equal(mod.getSupervisorEntitlement().configured, true)
    const stub = thinkerStub()
    const plan = await (mod.licensedThinker(stub).proposeRepairPlan({ incidentId: 'i-3' }) as Promise<{ planId: string }>)
    assert.equal(plan.planId, 'p1')
    assert.deepEqual(stub.calls, ['i-3'], 'the real implementation ran')
  })
})

test('a licence for a DIFFERENT product does not unlock this one', async () => {
  const { publicKeyPem, privateKeyPem } = keyPair()
  const token = issueLicense(claimsFor({ productId: 'press-media', edition: 'standard', features: ['press.compose'] }), privateKeyPem)

  await withEnv({ SUPERVISOR_LICENSE_TOKEN: token, SUPERVISOR_LICENSE_ISSUER: ISSUER, SUPERVISOR_LICENSE_PUBLIC_KEYS: publicKeyPem }, async (mod) => {
    const stub = thinkerStub()
    await assert.rejects(() => mod.licensedThinker(stub).proposeRepairPlan({ incidentId: 'i-4' }) as Promise<unknown>)
    assert.deepEqual(stub.calls, [])
  })
})

test('a licence signed by a FOREIGN key is refused', async () => {
  const real = keyPair()
  const attacker = keyPair()
  const token = issueLicense(claimsFor({ licensee: 'Not A Customer', features: ['repair.plan'] }), attacker.privateKeyPem)

  await withEnv({ SUPERVISOR_LICENSE_TOKEN: token, SUPERVISOR_LICENSE_ISSUER: ISSUER, SUPERVISOR_LICENSE_PUBLIC_KEYS: real.publicKeyPem }, async (mod) => {
    const stub = thinkerStub()
    await assert.rejects(() => mod.licensedThinker(stub).proposeRepairPlan({ incidentId: 'i-5' }) as Promise<unknown>)
    assert.deepEqual(stub.calls, [], 'anyone can mint a token; only ours verifies')
  })
})

test('observing is NOT gated, whatever the licence state', async () => {
  // The catalogue rule made concrete: charging a buyer to see what happened in their
  // own infrastructure turns a licence into leverage during an incident.
  await withEnv({}, async (mod) => {
    const gate = mod.supervisorGate()
    const read = await gate.check('incident.observe', 'read')
    const observe = await gate.check('siem.export', 'observe')
    assert.equal(read.allowed, true)
    assert.equal(observe.allowed, true)

    const execute = await gate.check('repair.plan', 'execute')
    assert.equal(execute.allowed, false)
  })
})

test('an expired licence refuses paid actions', async () => {
  const { publicKeyPem, privateKeyPem } = keyPair()
  const token = issueLicense(claimsFor({
    licensee: 'Lapsed Corp',
    features: ['repair.plan'],
    issuedAt: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
    notBefore: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString(),
    expiresAt: new Date(Date.now() - 300 * 24 * 3600 * 1000).toISOString(),
  }), privateKeyPem)

  await withEnv({ SUPERVISOR_LICENSE_TOKEN: token, SUPERVISOR_LICENSE_ISSUER: ISSUER, SUPERVISOR_LICENSE_PUBLIC_KEYS: publicKeyPem }, async (mod) => {
    const stub = thinkerStub()
    await assert.rejects(() => mod.licensedThinker(stub).proposeRepairPlan({ incidentId: 'i-6' }) as Promise<unknown>)
  })
})

test('every refusal is reported so it can be audited', async () => {
  await withEnv({}, async (mod) => {
    const refusals: Array<{ method: string; reason: string }> = []
    const guarded = mod.licensedThinker(thinkerStub(), event => refusals.push({ method: event.method, reason: event.reason }))
    await assert.rejects(() => guarded.proposeRepairPlan({ incidentId: 'i-7' }) as Promise<unknown>)

    assert.equal(refusals.length, 1)
    assert.equal(refusals[0].method, 'proposeRepairPlan')
    assert.ok(refusals[0].reason.length > 0)
  })
})

test('the dispatcher guard names the method the dispatcher actually has', async () => {
  // A typo in a classify rule is a control that silently does nothing, which is worse
  // than no control. `dispatch` is the SupervisorDispatcher's only public method.
  await withEnv({}, async (mod) => {
    const calls: string[] = []
    const dispatcher = { dispatch(request: { id: string }) { calls.push(request.id); return { status: 'ok' } } }
    const guarded = mod.licensedDispatcher(dispatcher)

    await assert.rejects(() => guarded.dispatch({ id: 'd-1' }) as Promise<unknown>)
    assert.deepEqual(calls, [], 'an unlicensed dispatch must not reach the executor')
  })
})
