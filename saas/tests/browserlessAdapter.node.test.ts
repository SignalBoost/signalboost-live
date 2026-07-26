// saas/tests/browserlessAdapter.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'
import {
  BrowserlessSessionFactory,
  validateBrowserlessAdapterConfiguration,
  type BrowserlessConnectionPort,
  type BrowserlessCredentialBrokerPort,
} from '../lib/portable-browser/adapters/browserless-adapter.ts'

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

const launchRequest = Object.freeze({
  provider: 'browserless',
  adapterId: 'browserless',
  mode: 'prepare_change' as const,
  allowedOrigins: Object.freeze(['http://localhost:4173']),
})

function createFactory(
  connection: BrowserlessConnectionPort,
  broker: BrowserlessCredentialBrokerPort = {
    resolveBrowserlessToken: async () => 'test-browserless-token',
  },
): BrowserlessSessionFactory {
  return new BrowserlessSessionFactory({
    endpoint: 'wss://production-sfo.browserless.io/chromium',
    approvedOrigins: ['http://localhost:4173'],
    credentialBroker: broker,
    connection,
  })
}

test('Browserless factory connects through the injected buyer credential and connection ports', async () => {
  const credentialScopes: string[] = []
  const connectUrls: string[] = []
  const opened = await createFactory({
    connect: async connectUrl => {
      connectUrls.push(connectUrl)
      return session
    },
  }, {
    resolveBrowserlessToken: async scope => {
      credentialScopes.push(scope.endpointOrigin)
      return 'test-browserless-token'
    },
  }).open(launchRequest)

  assert.equal(opened, session)
  assert.deepEqual(credentialScopes, ['wss://production-sfo.browserless.io'])
  assert.deepEqual(connectUrls, ['wss://production-sfo.browserless.io/chromium?token=test-browserless-token'])
})

test('Browserless factory rejects external targets and execute_change before credential resolution', async () => {
  let credentialReads = 0
  const factory = createFactory({ connect: async () => session }, {
    resolveBrowserlessToken: async () => {
      credentialReads += 1
      return 'test-browserless-token'
    },
  })

  await assert.rejects(
    factory.open({ ...launchRequest, allowedOrigins: ['https://github.com'] }),
    /browserless_origin_rejected/,
  )
  await assert.rejects(
    factory.open({ ...launchRequest, mode: 'execute_change' }),
    /browserless_execute_change_rejected/,
  )
  assert.equal(credentialReads, 0)
})

test('Browserless factory rejects unapproved loopback origins before credential resolution', async () => {
  let credentialReads = 0
  const factory = createFactory({ connect: async () => session }, {
    resolveBrowserlessToken: async () => {
      credentialReads += 1
      return 'test-browserless-token'
    },
  })

  await assert.rejects(
    factory.open({ ...launchRequest, allowedOrigins: ['http://localhost:9999'] }),
    /browserless_origin_rejected/,
  )
  assert.equal(credentialReads, 0)
})

test('Browserless factory sanitizes token material from connection failures', async () => {
  const factory = createFactory({
    connect: async connectUrl => {
      throw new Error(`connection failed ${connectUrl}`)
    },
  })

  await assert.rejects(factory.open(launchRequest), error => {
    assert.match(String(error), /\[redacted\]/)
    assert.doesNotMatch(String(error), /test-browserless-token/)
    return true
  })
})

test('Browserless configuration rejects credential-bearing, non-wss, and unsupported endpoints', () => {
  const base = {
    approvedOrigins: ['http://localhost:4173'],
    credentialBroker: { resolveBrowserlessToken: async () => 'token' },
    connection: { connect: async () => session },
  }

  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, endpoint: 'wss://production-sfo.browserless.io/chromium' }), true)
  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, endpoint: 'https://production-sfo.browserless.io/chromium' }), false)
  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, endpoint: 'wss://production-sfo.browserless.io/chromium?token=literal' }), false)
  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, endpoint: 'wss://user:pass@production-sfo.browserless.io/chromium' }), false)
  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, endpoint: 'wss://production-sfo.browserless.io/unsupported' }), false)
  // A buyer production origin is VALID now — the allowlist is the cage, not localhost.
  // What must still fail closed is a downgraded or malformed origin.
  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, endpoint: 'wss://production-sfo.browserless.io/chromium', approvedOrigins: ['https://example.com'] }), true)
  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, approvedOrigins: ['http://app.acme.com'] }), false)
  assert.equal(validateBrowserlessAdapterConfiguration({ ...base, approvedOrigins: ['https://acme.com/app'] }), false)
})
