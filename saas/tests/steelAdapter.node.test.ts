import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'
import {
  FetchSteelSessionTransport,
  SteelSessionFactory,
  validateSteelAdapterConfiguration,
  type SteelCredentialBrokerPort,
  type SteelSessionTransport,
} from '../lib/portable-browser/adapters/steel-adapter.ts'

const launchRequest = Object.freeze({
  provider: 'steel',
  adapterId: 'steel',
  mode: 'prepare_change' as const,
  allowedOrigins: Object.freeze(['http://localhost:4173']),
})

const session = Object.freeze({
  page: Object.freeze({
    url: () => 'http://localhost:4173',
    goto: async () => undefined,
    click: async () => undefined,
    fill: async () => undefined,
    waitForSelector: async () => undefined,
  }),
  close: async () => undefined,
}) satisfies BrowserSessionPort

function createFactory(
  transport: SteelSessionTransport,
  broker: SteelCredentialBrokerPort = { resolveSteelApiKey: async () => 'test-steel-key' },
): SteelSessionFactory {
  return new SteelSessionFactory({
    apiBaseUrl: 'https://api.steel.dev',
    connectOrigin: 'wss://connect.steel.dev',
    approvedOrigins: ['http://localhost:4173'],
    credentialBroker: broker,
    transport,
  })
}

test('Steel factory creates and connects to a buyer-managed session', async () => {
  const creates: Array<{ apiBaseUrl: string; apiKey: string }> = []
  const connections: string[] = []
  const opened = await createFactory({
    createSession: async request => {
      creates.push({ ...request })
      return { sessionId: 'session-1', websocketUrl: 'wss://connect.steel.dev?sessionId=session-1' }
    },
    connect: async connectUrl => {
      connections.push(connectUrl)
      return session
    },
  }).open(launchRequest)

  assert.equal(opened, session)
  assert.deepEqual(creates, [{ apiBaseUrl: 'https://api.steel.dev', apiKey: 'test-steel-key' }])
  assert.equal(connections.length, 1)
  const connectUrl = new URL(connections[0])
  assert.equal(connectUrl.origin, 'wss://connect.steel.dev')
  assert.equal(connectUrl.searchParams.get('sessionId'), 'session-1')
  assert.equal(connectUrl.searchParams.get('apiKey'), 'test-steel-key')
})

test('Steel factory rejects external origins and execute_change before credential access', async () => {
  let credentialReads = 0
  const factory = createFactory({
    createSession: async () => { throw new Error('must not create') },
    connect: async () => session,
  }, {
    resolveSteelApiKey: async () => {
      credentialReads += 1
      return 'test-steel-key'
    },
  })

  await assert.rejects(factory.open({ ...launchRequest, allowedOrigins: ['https://example.com'] }), /steel_external_origin_rejected/)
  await assert.rejects(factory.open({ ...launchRequest, mode: 'execute_change' }), /steel_execute_change_rejected/)
  assert.equal(credentialReads, 0)
})

test('Steel factory rejects untrusted websocket origins and mismatched session ids', async () => {
  await assert.rejects(createFactory({
    createSession: async () => ({ sessionId: 'session-1', websocketUrl: 'wss://evil.example?sessionId=session-1' }),
    connect: async () => session,
  }).open(launchRequest), /steel_websocket_url_invalid/)

  await assert.rejects(createFactory({
    createSession: async () => ({ sessionId: 'session-1', websocketUrl: 'wss://connect.steel.dev?sessionId=session-2' }),
    connect: async () => session,
  }).open(launchRequest), /steel_session_id_mismatch/)
})

test('Steel factory redacts API key material from connection errors', async () => {
  const factory = createFactory({
    createSession: async () => ({ sessionId: 'session-1', websocketUrl: 'wss://connect.steel.dev?sessionId=session-1' }),
    connect: async connectUrl => { throw new Error(`connection failed ${connectUrl}`) },
  })

  await assert.rejects(factory.open(launchRequest), error => {
    assert.match(String(error), /\[redacted\]/)
    assert.doesNotMatch(String(error), /test-steel-key/)
    return true
  })
})

test('FetchSteelSessionTransport calls the Steel Sessions API without an SDK', async () => {
  const requests: Array<{ url: string; init: unknown }> = []
  const transport = new FetchSteelSessionTransport(async (url, init) => {
    requests.push({ url, init })
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'session-2', websocketUrl: 'wss://connect.steel.dev?sessionId=session-2' }),
    }
  }, { connect: async () => session })

  const created = await transport.createSession({ apiBaseUrl: 'https://api.steel.dev', apiKey: 'test-steel-key' })
  assert.deepEqual(created, {
    sessionId: 'session-2',
    websocketUrl: 'wss://connect.steel.dev?sessionId=session-2',
  })
  assert.deepEqual(requests, [{
    url: 'https://api.steel.dev/v1/sessions',
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'steel-api-key': 'test-steel-key' },
      body: '{}',
    },
  }])
})

test('Steel configuration validation fails closed', () => {
  const valid = {
    apiBaseUrl: 'https://api.steel.dev',
    connectOrigin: 'wss://connect.steel.dev',
    approvedOrigins: ['http://localhost:4173'],
    credentialBroker: { resolveSteelApiKey: async () => 'test-steel-key' },
    transport: { createSession: async () => ({ sessionId: 'x', websocketUrl: 'wss://connect.steel.dev?sessionId=x' }), connect: async () => session },
  }
  assert.equal(validateSteelAdapterConfiguration(valid), true)
  assert.equal(validateSteelAdapterConfiguration({ ...valid, apiBaseUrl: 'http://api.steel.dev' }), false)
  assert.equal(validateSteelAdapterConfiguration({ ...valid, connectOrigin: 'wss://connect.steel.dev?apiKey=embedded' }), false)
  assert.equal(validateSteelAdapterConfiguration({ ...valid, approvedOrigins: ['https://github.com'] }), false)
})
