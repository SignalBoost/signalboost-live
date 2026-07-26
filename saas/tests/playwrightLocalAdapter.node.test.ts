// saas/tests/playwrightLocalAdapter.node.test.ts
import test from 'node:test'
import assert from 'node:assert/strict'
import type { BrowserSessionPort } from '../lib/browser-runtime/contracts.ts'
import {
  PlaywrightLocalSessionFactory,
  validatePlaywrightLocalAdapterConfiguration,
  type PlaywrightLocalLauncherPort,
} from '../lib/portable-browser/adapters/playwright-local-adapter.ts'

const session: BrowserSessionPort = Object.freeze({
  page: Object.freeze({
    url: () => 'http://localhost:4173',
    goto: async () => undefined,
    click: async () => undefined,
    fill: async () => undefined,
    waitForSelector: async () => undefined,
  }),
  close: async () => undefined,
})

function request(overrides: Partial<{ provider: string; adapterId: string; mode: 'observe' | 'prepare_change' | 'execute_change'; allowedOrigins: readonly string[] }> = {}) {
  return {
    provider: overrides.provider ?? 'playwright',
    adapterId: overrides.adapterId ?? 'playwright',
    mode: overrides.mode ?? 'observe',
    allowedOrigins: overrides.allowedOrigins ?? ['http://localhost:4173'],
  }
}

test('launches buyer-configured local Playwright through the injected launcher', async () => {
  const launches: unknown[] = []
  const launcher: PlaywrightLocalLauncherPort = {
    launch: async options => { launches.push(options); return session },
  }
  const factory = new PlaywrightLocalSessionFactory({
    approvedOrigins: ['http://localhost:4173'],
    engine: 'chromium',
    headless: true,
    args: ['--disable-dev-shm-usage'],
    launcher,
  })

  assert.equal(await factory.open(request()), session)
  assert.deepEqual(launches, [{
    engine: 'chromium',
    headless: true,
    executablePath: undefined,
    args: ['--disable-dev-shm-usage'],
  }])
})

test('rejects execute_change and unapproved origins before launching a browser', async () => {
  let launches = 0
  const factory = new PlaywrightLocalSessionFactory({
    approvedOrigins: ['http://localhost:4173'],
    engine: 'firefox',
    launcher: { launch: async () => { launches += 1; return session } },
  })

  await assert.rejects(factory.open(request({ mode: 'execute_change' })), /playwright_execute_change_rejected/)
  await assert.rejects(factory.open(request({ allowedOrigins: ['https://example.com'] })), /playwright_origin_rejected/)
  await assert.rejects(factory.open(request({ allowedOrigins: ['http://localhost:3000'] })), /playwright_origin_rejected/)
  assert.equal(launches, 0)
})

test('validates engines, configuration shape, and launcher failures', async () => {
  const valid = {
    approvedOrigins: ['http://127.0.0.1:4173'],
    engine: 'webkit' as const,
    launcher: { launch: async () => session },
  }
  assert.equal(validatePlaywrightLocalAdapterConfiguration(valid), true)
  assert.equal(validatePlaywrightLocalAdapterConfiguration({ ...valid, engine: 'chrome' }), false)
  // A buyer production origin is VALID now — the allowlist is the cage, not localhost.
  // What must still fail closed is a downgraded or malformed origin.
  assert.equal(validatePlaywrightLocalAdapterConfiguration({ ...valid, approvedOrigins: ['https://example.com'] }), true)
  assert.equal(validatePlaywrightLocalAdapterConfiguration({ ...valid, approvedOrigins: ['http://app.acme.com'] }), false)
  assert.equal(validatePlaywrightLocalAdapterConfiguration({ ...valid, approvedOrigins: ['https://acme.com/app'] }), false)

  const factory = new PlaywrightLocalSessionFactory({
    ...valid,
    launcher: { launch: async () => { throw new Error('local launch failed') } },
  })
  await assert.rejects(factory.open(request({ allowedOrigins: ['http://127.0.0.1:4173'] })), /local launch failed/)
})
