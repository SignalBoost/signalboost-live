// saas/tests/browserbaseAdapter.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'
import {
  BrowserbaseSessionFactory,
  FetchBrowserbaseSessionTransport,
  validateBrowserbaseAdapterConfiguration,
  type BrowserbaseCredentialBrokerPort,
  type BrowserbaseSessionTransport,
} from '../lib/portable-browser/adapters/browserbase-adapter.ts'

const launchRequest = Object.freeze({
  provider: 'browserbase',
  adapterId: 'browserbase',
  mode: 'prepare_change' as const,
  allowedOrigins: Object.freeze(['http://localhost:4173']),
})

const session = Object.freeze({ page: Object.freeze({
  url: () => 'http://localhost:4173', goto: async () => undefined, click: async () => undefined,
  fill: async () => undefined, waitForSelector: async () => undefined,
}), close: async () => undefined }) satisfies BrowserSessionPort

function createFactory(transport: BrowserbaseSessionTransport, broker: BrowserbaseCredentialBrokerPort = {
  resolveBrowserbaseApiKey: async () => 'test-broker-key',
}): BrowserbaseSessionFactory {
  return new BrowserbaseSessionFactory({
    projectId: 'buyer-project', approvedOrigins: ['http://localhost:4173'], credentialBroker: broker, transport,
  })
}

test('Browserbase factory opens a sandbox session through injected broker and transport', async () => {
  const calls: Array<{ projectId: string; apiKey: string }> = []
  const connections: string[] = []
  const opened = await createFactory({
    createSession: async request => { calls.push({ ...request }); return { sessionId: 'session-1', connectUrl: 'wss://connect.browserbase.test/session-1' } },
    connect: async connectUrl => { connections.push(connectUrl); return session },
  }).open(launchRequest)

  assert.equal(opened, session)
  assert.deepEqual(calls, [{ projectId: 'buyer-project', apiKey: 'test-broker-key' }])
  assert.deepEqual(connections, ['wss://connect.browserbase.test/session-1'])
})

test('Browserbase factory rejects external, unapproved, and execute_change launches before credentials', async () => {
  let credentialReads = 0
  const factory = createFactory({ createSession: async () => { throw new Error('must not create') }, connect: async () => session }, {
    resolveBrowserbaseApiKey: async () => { credentialReads += 1; return 'test-broker-key' },
  })
  // A production origin is legitimate now; what makes it safe is that it must be in the
  // buyer's declared allowlist. An origin the buyer never named is still refused.
  await assert.rejects(factory.open({ ...launchRequest, allowedOrigins: ['https://github.com'] }), /browserbase_origin_rejected/)
  await assert.rejects(factory.open({ ...launchRequest, allowedOrigins: ['http://127.0.0.1:4173'] }), /browserbase_origin_rejected/)
  await assert.rejects(factory.open({ ...launchRequest, mode: 'execute_change' }), /browserbase_execute_change_rejected/)
  assert.equal(credentialReads, 0)
})

test('Browserbase accepts a buyer production origin and still fails closed on a bad one', () => {
  const credentialBroker = { resolveBrowserbaseApiKey: async () => 'test-broker-key' }
  const transport = { createSession: async () => ({ sessionId: 'session', connectUrl: 'wss://example.test' }), connect: async () => session }

  // A real buyer origin is the point of the adapter — the allowlist is the cage, not localhost.
  assert.equal(validateBrowserbaseAdapterConfiguration({
    projectId: 'buyer-project', approvedOrigins: ['https://app.acme.com'], credentialBroker, transport,
  }), true)

  // Downgraded transport and malformed origins still fail closed.
  assert.throws(() => new BrowserbaseSessionFactory({
    projectId: 'buyer-project', approvedOrigins: ['http://app.acme.com'], credentialBroker, transport,
  }), /browserbase_insecure_origin_rejected/)
  assert.throws(() => new BrowserbaseSessionFactory({
    projectId: 'buyer-project', approvedOrigins: ['https://acme.com/app'], credentialBroker, transport,
  }), /browserbase_invalid_origin/)
})

test('Browserbase factory sanitizes broker key material from transport errors', async () => {
  const factory = createFactory({
    createSession: async request => { throw new Error(`remote failure api_key=${request.apiKey}`) },
    connect: async () => session,
  })
  await assert.rejects(factory.open(launchRequest), error => {
    assert.match(String(error), /\[redacted\]/)
    assert.doesNotMatch(String(error), /test-broker-key/)
    return true
  })
})

test('FetchBrowserbaseSessionTransport uses the Browserbase create-session API without a browser SDK', async () => {
  const requests: Array<{ url: string; init: unknown }> = []
  const transport = new FetchBrowserbaseSessionTransport(async (url, init) => {
    requests.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ id: 'session-2', connectUrl: 'wss://connect.browserbase.test/session-2' }) }
  }, { connect: async () => session })

  const created = await transport.createSession({ projectId: 'buyer-project', apiKey: 'test-broker-key' })
  assert.deepEqual(created, { sessionId: 'session-2', connectUrl: 'wss://connect.browserbase.test/session-2' })
  assert.deepEqual(requests, [{ url: 'https://api.browserbase.com/v1/sessions', init: {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-bb-api-key': 'test-broker-key' }, body: '{"projectId":"buyer-project"}',
  } }])
})
