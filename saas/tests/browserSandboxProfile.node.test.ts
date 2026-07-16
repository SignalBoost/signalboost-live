import assert from 'node:assert/strict'
import test from 'node:test'

import type { BrowserSessionLaunchRequest } from '../lib/browser-runtime/contracts.ts'
import { SandboxBrowserLaunchProfileProvider } from '../lib/browser-runtime/launch-profile.ts'
import { DefaultBrowserSessionFactory, type BrowserEngineLaunchOptions } from '../lib/browser-runtime/session-factory.ts'

function request(
  overrides: Partial<BrowserSessionLaunchRequest> = {},
): BrowserSessionLaunchRequest {
  return {
    provider: 'sandbox',
    adapterId: 'signalboost.sandbox.v1',
    mode: 'observe',
    allowedOrigins: ['http://127.0.0.1:4173'],
    ...overrides,
  }
}

test('sandbox profile accepts the bounded sandbox launch scope', () => {
  const provider = new SandboxBrowserLaunchProfileProvider()
  const profile = provider.resolve(request())

  assert.equal(profile.id, 'sandbox.chromium.v1')
  assert.equal(profile.headless, true)
  assert.deepEqual(profile.viewport, { width: 1280, height: 800 })
  assert.deepEqual(profile.launchArgs, ['--disable-extensions', '--disable-sync', '--no-first-run'])
})

test('sandbox profile rejects non-sandbox providers and adapters', () => {
  const provider = new SandboxBrowserLaunchProfileProvider()

  assert.throws(() => provider.resolve(request({ provider: 'vercel' })), /rejected provider/)
  assert.throws(() => provider.resolve(request({ adapterId: 'vercel.dashboard.v1' })), /rejected adapter/)
})

test('sandbox profile rejects production execution and unapproved origins', () => {
  const provider = new SandboxBrowserLaunchProfileProvider()

  assert.throws(() => provider.resolve(request({ mode: 'execute_change' })), /does not allow execute_change/)
  assert.throws(
    () => provider.resolve(request({ allowedOrigins: ['https://vercel.com'] })),
    /rejected origin/,
  )
})

test('session factory applies the bounded sandbox launch profile', async () => {
  let launchOptions: BrowserEngineLaunchOptions | undefined
  let contextViewport: { width: number; height: number } | undefined

  const factory = new DefaultBrowserSessionFactory({
    profileProvider: new SandboxBrowserLaunchProfileProvider(),
    launcher: {
      async launch(options) {
        launchOptions = options
        return {
          async newContext(contextOptions) {
            contextViewport = contextOptions.viewport
            return {
              async newPage() {
                return {
                  url: () => 'about:blank',
                  async goto() {},
                  async click() {},
                  async fill() {},
                  async waitForSelector() {},
                }
              },
              async close() {},
            }
          },
          async close() {},
        }
      },
    },
  })

  const session = await factory.open(request())
  await session.close()

  assert.equal(launchOptions?.headless, true)
  assert.equal(launchOptions?.timeoutMs, 20_000)
  assert.deepEqual(launchOptions?.args, ['--disable-extensions', '--disable-sync', '--no-first-run'])
  assert.deepEqual(contextViewport, { width: 1280, height: 800 })
})
