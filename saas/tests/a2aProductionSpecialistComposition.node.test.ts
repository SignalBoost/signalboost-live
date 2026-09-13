import assert from 'node:assert/strict'
import test from 'node:test'
import {
  A2A_PRODUCTION_SPECIALIST_BINDINGS_ENV,
  composeProductionBuyerSpecialists,
} from '../a2a-host/a2a-production-specialist-composition.ts'
import { A2A_BUYER_MANIFEST_VERSION } from '../a2a-host/a2a-buyer-manifest.ts'

function card(name: string) {
  return {
    protocolVersion: '0.3.0',
    name,
    description: `${name} buyer-owned software specialist`,
    url: `https://${name.toLowerCase().replaceAll(' ', '-')}.example/a2a`,
    preferredTransport: 'JSONRPC',
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['application/json'],
    skills: [{ id: 'software.analyze', name: 'software.analyze', description: 'Analyze software', tags: ['software'] }],
  }
}

function binding(agentId: string, suffix: string) {
  return {
    manifest: {
      schemaVersion: A2A_BUYER_MANIFEST_VERSION,
      agentId,
      transportRef: `buyer:tenant-a:prod:${agentId}:http+jsonrpc`,
      assignmentId: `${agentId}:tenant-a:prod:portable-software`,
      tenantId: 'tenant-a',
      environmentId: 'prod',
      portableId: 'portable-software',
      approvedSkills: [{ skillId: 'software.analyze', risk: 'advisory' }],
    },
    agentCardUrlEnv: `BUYER_${suffix}_CARD_URL`,
    transportEndpointEnv: `BUYER_${suffix}_RPC_URL`,
    transportHeadersEnv: `BUYER_${suffix}_RPC_HEADERS`,
  }
}

function environment(overrides: Record<string, string> = {}) {
  const bindings = [binding('software-primary', 'PRIMARY'), binding('software-fallback', 'FALLBACK')]
  return {
    [A2A_PRODUCTION_SPECIALIST_BINDINGS_ENV]: JSON.stringify(bindings),
    BUYER_PRIMARY_CARD_URL: 'http://127.0.0.1:4101/card',
    BUYER_PRIMARY_RPC_URL: 'http://127.0.0.1:4101/rpc',
    BUYER_PRIMARY_RPC_HEADERS: JSON.stringify({ authorization: 'Bearer primary-secret' }),
    BUYER_FALLBACK_CARD_URL: 'http://127.0.0.1:4102/card',
    BUYER_FALLBACK_RPC_URL: 'http://127.0.0.1:4102/rpc',
    BUYER_FALLBACK_RPC_HEADERS: JSON.stringify({ authorization: 'Bearer fallback-secret' }),
    ...overrides,
  }
}

function fetchHarness() {
  const requests: Array<{ url: string; method: string; authorization: string | null }> = []
  const fetchImpl = async (input: string | URL, init?: RequestInit) => {
    const url = String(input)
    const method = String(init?.method ?? 'GET').toUpperCase()
    const requestHeaders = new Headers(init?.headers)
    requests.push({ url, method, authorization: requestHeaders.get('authorization') })
    if (method === 'GET') {
      const body = url.includes('4101') ? card('Primary Software') : card('Fallback Software')
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { kind: 'message', role: 'agent', messageId: 'm-1', parts: [] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetchImpl, requests }
}

test('Production composition activates two independently bound same-skill buyer specialists without serializing endpoints or credentials', async () => {
  const harness = fetchHarness()
  const composition = await composeProductionBuyerSpecialists({
    env: environment(),
    fetchImpl: harness.fetchImpl,
    allowInsecureLoopbackForTests: true,
  })
  const snapshot = await composition.registry.snapshot()

  assert.equal(composition.bindingCount, 2)
  assert.deepEqual(composition.agentIds, ['software-primary', 'software-fallback'])
  assert.equal(snapshot.agents.length, 2)
  assert.equal(snapshot.assignments.length, 2)
  assert.ok(snapshot.assignments.every(item => item.allowedSkills.some(skill => skill.skillId === 'software.analyze' && skill.risk === 'advisory')))

  const serialized = JSON.stringify({ snapshot, agentIds: composition.agentIds, bindingCount: composition.bindingCount })
  assert.ok(!serialized.includes('127.0.0.1'))
  assert.ok(!serialized.includes('primary-secret'))
  assert.ok(!serialized.includes('fallback-secret'))
  assert.ok(!serialized.toLowerCase().includes('authorization'))
})

test('Production composition binds each logical transportRef to its exact secret-backed endpoint and exact scope', async () => {
  const harness = fetchHarness()
  const composition = await composeProductionBuyerSpecialists({
    env: environment(),
    fetchImpl: harness.fetchImpl,
    allowInsecureLoopbackForTests: true,
  })
  const transport = composition.transportFactory.create({
    agentId: 'software-primary',
    transportRef: 'buyer:tenant-a:prod:software-primary:http+jsonrpc',
    scope: { tenantId: 'tenant-a', environmentId: 'prod', portableId: 'portable-software' },
  })
  await transport.send({
    agentId: 'software-primary',
    transportRef: 'buyer:tenant-a:prod:software-primary:http+jsonrpc',
    scope: { tenantId: 'tenant-a', environmentId: 'prod', portableId: 'portable-software' },
    request: { jsonrpc: '2.0', id: 1, method: 'message/send', params: {} },
    timeoutMs: 1_000,
  })
  const post = harness.requests.find(item => item.method === 'POST')
  assert.equal(post?.url, 'http://127.0.0.1:4101/rpc')
  assert.equal(post?.authorization, 'Bearer primary-secret')

  const wrongScope = composition.transportFactory.create({
    agentId: 'software-primary',
    transportRef: 'buyer:tenant-a:prod:software-primary:http+jsonrpc',
    scope: { tenantId: 'tenant-a', environmentId: 'stage', portableId: 'portable-software' },
  })
  await assert.rejects(
    wrongScope.send({
      agentId: 'software-primary',
      transportRef: 'buyer:tenant-a:prod:software-primary:http+jsonrpc',
      scope: { tenantId: 'tenant-a', environmentId: 'stage', portableId: 'portable-software' },
      request: { jsonrpc: '2.0', id: 2, method: 'message/send', params: {} },
      timeoutMs: 1_000,
    }),
    /a2a_production_specialist_binding_scope_mismatch/,
  )
  assert.equal(harness.requests.filter(item => item.method === 'POST').length, 1)
})

test('Production composition fails closed before network access when two specialists share a live transport endpoint', async () => {
  const harness = fetchHarness()
  await assert.rejects(
    composeProductionBuyerSpecialists({
      env: environment({ BUYER_FALLBACK_RPC_URL: 'http://127.0.0.1:4101/rpc' }),
      fetchImpl: harness.fetchImpl,
      allowInsecureLoopbackForTests: true,
    }),
    /a2a_production_specialist_duplicate_transport_endpoint/,
  )
  assert.equal(harness.requests.length, 0)
})

test('Production composition rejects reused transport authorization across nominally different workers', async () => {
  const harness = fetchHarness()
  await assert.rejects(
    composeProductionBuyerSpecialists({
      env: environment({ BUYER_FALLBACK_RPC_HEADERS: JSON.stringify({ authorization: 'Bearer primary-secret' }) }),
      fetchImpl: harness.fetchImpl,
      allowInsecureLoopbackForTests: true,
    }),
    /a2a_production_specialist_duplicate_transport_authorization/,
  )
  assert.equal(harness.requests.length, 0)
})

test('Production composition rejects non-HTTPS non-loopback endpoints and missing secret bindings without leaking their values', async () => {
  const harness = fetchHarness()
  const badEndpoint = environment({ BUYER_PRIMARY_RPC_URL: 'http://buyer.invalid/rpc?token=do-not-leak' })
  await assert.rejects(
    composeProductionBuyerSpecialists({ env: badEndpoint, fetchImpl: harness.fetchImpl, allowInsecureLoopbackForTests: true }),
    error => {
      const message = String(error)
      assert.match(message, /a2a_production_specialist_transport_url_must_be_https/)
      assert.ok(!message.includes('do-not-leak'))
      return true
    },
  )

  const missing = environment()
  delete (missing as Record<string, string>).BUYER_PRIMARY_RPC_HEADERS
  await assert.rejects(
    composeProductionBuyerSpecialists({ env: missing, fetchImpl: harness.fetchImpl, allowInsecureLoopbackForTests: true }),
    /a2a_production_specialist_environment_value_missing:BUYER_PRIMARY_RPC_HEADERS/,
  )
  assert.equal(harness.requests.length, 0)
})
